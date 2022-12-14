import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { MetricAlarm } from "@pulumi/aws/cloudwatch";

/** interface declaring what data is needed to pass in to create our data pipeline */
export interface DataPipelineArgs {
    /* the name of the bucket that we want to create */
    BucketName: string
}

/** 
 * General abstraction for all of our data pipeline. 
 * 
 * This could be a resource provider, but I'm not sure about the details or tradeoffs.  
 * 
 *  This pipeline is going to place everything it reads into multpile places: 
 *  - S3 bucket
 *  - processed by lambda 
 */
export class DataPipeline extends pulumi.ComponentResource {

    destinationBucket: aws.s3.Bucket;
    firehoseStream: aws.kinesis.FirehoseDeliveryStream;
    logGroupName: string;

    constructor(name: string, args: DataPipelineArgs, opts?: pulumi.ComponentResourceOptions) {
        super("pkg:index:DataPipeline", name, args, opts);

        this.destinationBucket = this.createBucket(args.BucketName);
        this.logGroupName = name + "-loggroup";

        // permissions for the firehouse delivery stream 
        const firehoseRole = new aws.iam.Role("firehoseRole", 
            {
                assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({Service: "firehose.amazonaws.com"})
            } 
        );
        const customFirehosePolicy = new aws.iam.Policy("full-firehose-permissions", {
            policy: `{
                "Version": "2012-10-17",  
                "Statement":
                [    
                    {      
                        "Effect": "Allow",      
                        "Action": [
                            "s3:AbortMultipartUpload",
                            "s3:GetBucketLocation",
                            "s3:GetObject",
                            "s3:ListBucket",
                            "s3:ListBucketMultipartUploads",
                            "s3:PutObject"
                        ],      
                        "Resource": [        
                            "*"
                        ]    
                    },        
                    {
                        "Effect": "Allow",
                        "Action": [
                            "kinesis:DescribeStream",
                            "kinesis:GetShardIterator",
                            "kinesis:GetRecords",
                            "kinesis:ListShards"
                        ],
                        "Resource": "*"
                    },
                    {
                    "Effect": "Allow",
                    "Action": [
                        "kms:Decrypt",
                        "kms:GenerateDataKey"
                    ],
                    "Resource": [
                        "*"
                    ],
                    "Condition": {
                        "StringEquals": {
                            "kms:ViaService": "s3.region.amazonaws.com"
                        },
                        "StringLike": {
                            "kms:EncryptionContext:aws:s3:arn": "*"
                        }
                    }
                    },
                    {
                    "Effect": "Allow",
                    "Action": [
                        "logs:PutLogEvents"
                    ],
                    "Resource": [
                        "*"
                    ]
                    },
                    {
                    "Effect": "Allow", 
                    "Action": [
                        "lambda:InvokeFunction", 
                        "lambda:GetFunctionConfiguration" 
                    ],
                    "Resource": [ "*" ]
                    }
                ]
            }`
        })
        const firehosePolicyAttachment = new aws.iam.RolePolicyAttachment("firehose-custom-policy", 
        {
            role: firehoseRole, 
            policyArn: customFirehosePolicy.arn
        })

        // permissions for the lambda which needs to execute and write to cloudwatch logs
        const lambdaRole = new aws.iam.Role("lambdaIam", 
            {assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({Service: "lambda.amazonaws.com"})
        });
        const fullAccess = new aws.iam.RolePolicyAttachment("lambda-access", {
            role: lambdaRole,
            policyArn: aws.iam.ManagedPolicy.LambdaFullAccess
        }) 
        const firehoseWriting = new aws.iam.RolePolicyAttachment("firehose-access", {
            role: lambdaRole, 
            policyArn: aws.iam.ManagedPolicy.AmazonKinesisFirehoseFullAccess
        })
        const lambdaExecution  = new aws.iam.RolePolicyAttachment("lambda-execution", {
            role: lambdaRole, 
            policyArn: aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole 
        })
        const lambdaLogging = new aws.iam.Policy("lambdaLogging", {
            path: "/",
            description: "IAM policy for logging from a lambda",
            policy: `{
                "Version": "2012-10-17",
                "Statement": [
                {
                    "Action": [
                        "logs:CreateLogGroup",
                        "logs:CreateLogStream",
                        "logs:PutLogEvents"
                    ],
                    "Resource": "arn:aws:logs:*:*:*",
                    "Effect": "Allow"
                    }
                ]
                }
                `,
        });      
        const lambdaLoggingAttachment = new aws.iam.RolePolicyAttachment("lambda-logging", {
            role: lambdaRole,
            policyArn: lambdaLogging.arn 
        } )


        const lambda = new aws.lambda.CallbackFunction("mylambda", {
            callback: async e => { 
                // your code here ...  
                console.log("Inside transform function.");
                return e;
            },
            role: lambdaRole,
            runtime: "nodejs16.x",
            timeout: 30,
        });


        const firehoseLogGroup = new aws.cloudwatch.LogGroup('mc-lambda-loggroup');
        const firehoseLogStream = new aws.cloudwatch.LogStream("mc-firehose-logs", {logGroupName: firehoseLogGroup.name});

        // Now we create the firehose stream... 
        // We have it configured to write into S3 and also be processed by 'lambdaProcessor'
        this.firehoseStream = new aws.kinesis.FirehoseDeliveryStream("mc-firehose-stream", {
            destination: "extended_s3",
            extendedS3Configuration: {
                roleArn: firehoseRole.arn,
                bucketArn: this.destinationBucket.arn,
                cloudwatchLoggingOptions: {
                    enabled: true,
                    logGroupName: firehoseLogGroup.name, 
                    logStreamName: firehoseLogStream.name, 
                },
                processingConfiguration: {
                    enabled: true,
                    processors: [{
                        type: "Lambda",
                        parameters: [{
                            parameterName: "LambdaArn",
                            parameterValue: pulumi.interpolate`${lambda.arn}:$LATEST`,
                        }],
                    }],
                },
            },
        }, {
            parent: this
        });

        // First stab at delivery lag alarm
        const s3DeliveryLagAlarm = new aws.cloudwatch.MetricAlarm("s3DeliveryLagAlarm", 
            {
                comparisonOperator: "GreaterThanOrEqualToThreshold",
                evaluationPeriods: 2,
                period: 120,
                metricName: "DeliveryToS3.DataFreshness",
                statistic: "Average",
                namespace: "Firehose",
                threshold: 60,
            }
        );

    }

    /** method to create our bucket and assign permissions  */
    private createBucket(bucketName: string) {

        const loggingBucket = new aws.s3.Bucket(bucketName + "-logging", {}, {parent: this});

        const destinationBucket = new aws.s3.Bucket(bucketName, {
            loggings: [{
                targetBucket: loggingBucket.id
            }]
        }, {parent: this});

        const bucketAcl = new aws.s3.BucketAclV2("bucketAcl", {
            bucket: destinationBucket.id,
            acl: "private",
        });

        return destinationBucket;
    }
}

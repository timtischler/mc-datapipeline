import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

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

    constructor(name: string, args: DataPipelineArgs, opts?: pulumi.ComponentResourceOptions) {
        super("pkg:index:DataPipeline", name, args, opts);

        this.destinationBucket = this.createBucket(args.BucketName);

        // permissions for the firehouse delivery stream 
        const firehoseRole = new aws.iam.Role("firehoseRole", 
            {
                assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({Service: "firehose.amazonaws.com"})
            } 
        );

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

        // Our lambda to process the data is in the component's lambdas directory so we're archiving it 
        // and pushing it up to the function.  
        // I would love to have better control over the versions but I'm not sure what that looks like yet. 
        const lambdaProcessor = new aws.lambda.Function("lambdaProcessor", {
            code: new pulumi.asset.AssetArchive({
                ".": new pulumi.asset.FileArchive("./lambdas/data-interceptor")
            }),
            role: lambdaRole.arn,
            handler: "exports.handler",
            runtime: "nodejs16.x",
        }, {
            parent: this
        });

        // Now we create the firehose stream... 
        // We have it configured to write into S3 and also be processed by 'lambdaProcessor'
        this.firehoseStream = new aws.kinesis.FirehoseDeliveryStream("mc-firehose-stream", {
            destination: "extended_s3",
            extendedS3Configuration: {
                roleArn: firehoseRole.arn,
                bucketArn: this.destinationBucket.arn,
                cloudwatchLoggingOptions: {
                    enabled: true,
                    logGroupName: 'mc-firehose-group',
                    logStreamName: 'mc-firehose-stream'
                },
                processingConfiguration: {
                    enabled: true,
                    processors: [{
                        type: "Lambda",
                        parameters: [{
                            parameterName: "LambdaArn",
                            parameterValue: pulumi.interpolate`${lambdaProcessor.arn}:$LATEST`,
                        }],
                    }],
                },
            },
        }, {
            parent: this
        });


    }

    /** method to create our bucket and assign permissions  */
    private createBucket(bucketName: string) {
        const destinationBucket = new aws.s3.Bucket(bucketName, {}, {parent: this});

        const bucketAcl = new aws.s3.BucketAclV2("bucketAcl", {
            bucket: destinationBucket.id,
            acl: "private",
        });

        return destinationBucket;
    }
}

import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import { FirehoseClient, PutRecordCommand } from "@aws-sdk/client-firehose";

export interface DataPublisherArgs {

}
export class DataPublisher extends pulumi.ComponentResource {

    public name: string;
    public dataStreamName: pulumi.Input<string>;

    constructor(name: string, args: { dataStream: string }, opts?: pulumi.ComponentResourceOptions) {
        
        super("pkg:index:DataPublisher", name, args, opts);
        this.name = name;
        this.dataStreamName = args.dataStream;


        // permissions for the lambda which needs to execute and write to cloudwatch logs
        const lambdaRole = new aws.iam.Role("lambda-producer-role", 
            {assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({Service: "lambda.amazonaws.com"})
        });
        const fullAccess = new aws.iam.RolePolicyAttachment("lambda-producer-access", {
            role: lambdaRole,
            policyArn: aws.iam.ManagedPolicy.LambdaFullAccess
        }) 
        const firehoseWriting = new aws.iam.RolePolicyAttachment("producer-firehose-access", {
            role: lambdaRole, 
            policyArn: aws.iam.ManagedPolicy.AmazonKinesisFirehoseFullAccess
        })
        const lambdaExecution  = new aws.iam.RolePolicyAttachment("lambda-producer-execution", {
            role: lambdaRole, 
            policyArn: aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole 
        })

        const lambdaProcessor = new aws.lambda.Function("dataGenerator", {
            code: new pulumi.asset.AssetArchive({
                ".": new pulumi.asset.FileArchive("./components/data-publisher/lambda")
            }),
            role: lambdaRole.arn,
            handler: "exports.handler",
            runtime: "nodejs16.x",
        });

        const dataGeneratorFunction: aws.cloudwatch.EventRuleEventHandler = async (
            event: aws.cloudwatch.EventRuleEvent
        ) => {

            const firehoseClient = new FirehoseClient({region: 'us-east-1'});

            const putMessageCommand = new PutRecordCommand({
                DeliveryStreamName: args.dataStream,
                Record: {
                    Data: new TextEncoder().encode("DO THE THING")
                } 
            });

            try { 
                const result = await firehoseClient.send(putMessageCommand);

                console.log("Data Generator To Firehose Success", result);
            } catch (err) { 
                console.error("Data Generator Firehouse", err);
            }
        }

        const dataGeneratorSchedule: aws.cloudwatch.EventRuleEventSubscription = aws.cloudwatch.onSchedule(
            name + "-scheduler", 
            "rate(1 minute)",
            dataGeneratorFunction
        )


        this.registerOutputs({
            bucketName: "Foobar"
        });
    }

}

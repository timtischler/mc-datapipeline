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

        const lambdaIam = new aws.iam.Role("generatorRoleIam", {assumeRolePolicy: `{
            "Version": "2012-10-17",
            "Statement": [
                {
                "Action": "sts:AssumeRole",
                "Principal": {
                    "Service": "lambda.amazonaws.com"
                },
                "Effect": "Allow",
                "Sid": ""
                }
            ]
            }
            `});


        const firehoseRole = new aws.iam.Role("firehosePublishingRole", {assumeRolePolicy: `{
            "Version": "2012-10-17",
            "Statement": [
                {
                "Action": "sts:AssumeRole",
                "Principal": {
                    "Service": "firehose.amazonaws.com"
                },
                "Effect": "Allow",
                "Sid": ""
                }
            ]
            }
            `});


        const lambdaProcessor = new aws.lambda.Function("dataGenerator", {
            code: new pulumi.asset.AssetArchive({
                ".": new pulumi.asset.FileArchive("./components/data-publisher/lambda")
            }),
            role: lambdaIam.arn,
            handler: "exports.handler",
            runtime: "nodejs16.x",
        });

        const withSns = new aws.lambda.Permission("withSns", {
            action: "lambda:InvokeFunction",
            "function": lambdaProcessor.name,
            principal: "firehose.amazonaws.com",
            sourceArn: "arn:aws:firehose:us-east-1:631061573609:deliverystream/mc-firehose-stream-50977e0",
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

import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { DataPublisher } from "./components/data-publisher";

import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const destinationBucket = new aws.s3.Bucket("mct-destination-bucket");

const firehoseRole = new aws.iam.Role("firehoseRole", 
    {assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
        Service: "firehose.amazonaws.com" 
    })
});

const lambdaIam = new aws.iam.Role("lambdaIam", 
    {assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
        Service: "lambda.amazonaws.com" 
    })
});


const lambdaProcessor = new aws.lambda.Function("lambdaProcessor", {
    code: new pulumi.asset.AssetArchive({
        ".": new pulumi.asset.FileArchive("./lambdas/data-interceptor")
    }),
    role: lambdaIam.arn,
    handler: "exports.handler",
    runtime: "nodejs16.x",
});

const extendedS3Stream = new aws.kinesis.FirehoseDeliveryStream("mc-firehose-stream", {
    destination: "extended_s3",
    extendedS3Configuration: {
        roleArn: firehoseRole.arn,
        bucketArn: destinationBucket.arn,
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
});
const bucketAcl = new aws.s3.BucketAclV2("bucketAcl", {
    bucket: destinationBucket.id,
    acl: "private",
});


const dataStream = new aws.kinesis.Stream("data-stream", {
    shardCount: 1,
    shardLevelMetrics: [
        "IncomingBytes",
        "OutgoingBytes",
        "IteratorAgeMilliseconds",
        "ReadProvisionedThroughputExceeded",
        "WriteProvisionedThroughputExceeded"
    ],
    streamModeDetails: {
        streamMode: "PROVISIONED"
    },
})


const myDataPublisher = new DataPublisher("mc-firehose-stream", {dataStream: "mc-firehose-stream"});

/** 
 * This is a quick way to upload the function.  
 * 
 *  A TODO may be to push up it up as a versioned function and then to set the version of the live function. 
 * 
 * Cloudwatch URL: https://us-east-1.console.aws.amazon.com/lambda/home?region=us-east-1#/functions/data-generator-scheduler-52a553c?tab=monitoring
 * 
 */
const queue = new aws.sqs.Queue("published-data-queue");

const dataGeneratorFunction: aws.cloudwatch.EventRuleEventHandler = async (
     event: aws.cloudwatch.EventRuleEvent
 ) => {
    const sqsClient = new SQSClient({ region: "us-east-1" });

    const params = { 
        QueueUrl: "https://sqs.us-east-1.amazonaws.com/631061573609/published-data-queue-ef98675",
        MessageBody: JSON.stringify({
            customer_id: 1234,
            value: 4321,
            message: "Hello"
        })
    }
    const sendMessageCommand = new SendMessageCommand(params);

    try { 
        const result = await sqsClient.send(new SendMessageCommand(params));
        console.log("Data Generator Publish Success", result);
    } catch (err) { 
        console.error("Data Generator", err);
    }
 }

const dataGeneratorSchedule: aws.cloudwatch.EventRuleEventSubscription = aws.cloudwatch.onSchedule(
    "data-generator-scheduler", 
    "rate(1 minute)",
    dataGeneratorFunction
)

export const bucketName = destinationBucket.bucket;
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { DataPublisher } from "./components/data-publisher";
import { DataPipeline } from "./components/data-pipeline";

import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";


const dataPipeline = new DataPipeline("mc-tischler-datapipeline", 
                    { BucketName: "mct-destination-bucket"}
                    );

// const dataStream = new aws.kinesis.Stream("data-stream", {
//     shardCount: 1,
//     shardLevelMetrics: [
//         "IncomingBytes",
//         "OutgoingBytes",
//         "IteratorAgeMilliseconds",
//         "ReadProvisionedThroughputExceeded",
//         "WriteProvisionedThroughputExceeded"
//     ],
//     streamModeDetails: {
//         streamMode: "PROVISIONED"
//     },
// })


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

export const bucketName = dataPipeline.destinationBucket.bucket;
export const firehoseDataPipeline = dataPipeline.firehoseStream.arn;
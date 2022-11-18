import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { generateDataFunction } from "./lambdas/data-generator";

const destinationBucket = new aws.s3.Bucket("mct-destination-bucket");

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
    }
})

/** 
 * This is a quick way to upload the function.  
 * 
 *  A TODO may be to push up it up as a versioned function and then to set the version of the live function. 
 */
// const dataGeneratorFunction: aws.cloudwatch.EventRuleEventHandler = async (
//     event: aws.cloudwatch.EventRuleEvent
// ) => {
    
//     console.log("DATA GENERATOR RAN V 2.0");
// }

const dataGeneratorSchedule: aws.cloudwatch.EventRuleEventSubscription = aws.cloudwatch.onSchedule(
    "data-generator-scheduler", 
    "rate(1 minute)",
    generateDataFunction
)

export const bucketName = destinationBucket.bucket;
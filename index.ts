import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { DataPublisher } from "./components/data-publisher";
import { DataPipeline } from "./components/data-pipeline";

const dataPipeline = new DataPipeline("mct-datapipeline", 
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


// const myDataPublisher = new DataPublisher("mc-firehose-stream", {dataStream: "mc-firehose-stream"});

export const bucketName = dataPipeline.destinationBucket.bucket;
export const firehoseDataPipeline = dataPipeline.firehoseStream.arn;
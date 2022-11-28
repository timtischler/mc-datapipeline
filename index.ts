import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { DataPublisher } from "./components/data-publisher";
import { DataPipeline } from "./components/data-pipeline";


/** I'm trying to abstract away the details of the data pipeline and leave this index file
 *  open for configuration changes and perhaps running a test data producer.
 */
const dataPipeline = new DataPipeline("mct-datapipeline", 
                    { BucketName: "mct-destination-bucket"}
                    );

export const bucketName = dataPipeline.destinationBucket.bucket;
export const firehoseDataPipeline = dataPipeline.firehoseStream.arn;
export const firehoseDataPipelineName = dataPipeline.firehoseStream.name;
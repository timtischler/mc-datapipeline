## How To Do Things

### Run simple data test 

```while [ true ]; do aws firehose put-record --delivery-stream-name $(pulumi stack output firehoseDataPipelineName) --record file://doc.json --cli-binary-format raw-in-base64-out; done```



### Initial new stack

`pulumi stack init staging`


## Things To Do: 
- Extract the concept of stack out into dev|staging|production
- Fix data generation 
- Extract region into configuration

- Go through configuration of firehose:  https://www.pulumi.com/registry/packages/aws/api-docs/kinesis/firehosedeliverystream/#firehosedeliverystreamextendeds3configurationcloudwatchloggingoptions

- TEST: limit throughput and push more data in than can be written


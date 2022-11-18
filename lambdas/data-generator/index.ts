import * as aws from "@pulumi/aws";

export async function generateDataFunction(event: aws.cloudwatch.EventRuleEvent ): Promise<void>{
    console.log("DATA GENERATOR RAN");
}
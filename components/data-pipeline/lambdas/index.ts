import * as aws from "@pulumi/aws";

/**
 * This is our lambda that is attached to the data pipeline and processes all of the data that is consumed by it. 
 * 
 * Currently it just outputs to cloudwatch.
 * 
 * @param event 
 */
export async function generateDataFunction(event: aws.cloudwatch.EventRuleEvent ): Promise<void>{


    console.log("DATA INTERCEPTOR RAN V2.0");
}
import * as cdk from 'aws-cdk-lib';
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import { Construct } from 'constructs';

interface ProductEventsFunctionStackProps extends cdk.StackProps {
    eventsDdb: dynamodb.Table
}

export class ProductEventsFunctionStack extends cdk.Stack {
    readonly handler: lambdaNodeJS.NodejsFunction;

    constructor(scope: Construct, id: string, props: ProductEventsFunctionStackProps) {
        super(scope, id, props);

        this.handler = this.createProductEventsFunction(props.eventsDdb);

        props.eventsDdb.grantWriteData(this.handler);
    }

    createProductEventsFunction(eventsDdb: dynamodb.Table) {
        return new lambdaNodeJS.NodejsFunction(this, "ProductEventsFunction", {
            functionName: "ProductEventsFunction",
            entry: "lambda/products/productEventsFunction.ts",
            handler: "handler",
            bundling: {
                minify: false,
                sourceMap: false,
            },
            tracing: lambda.Tracing.ACTIVE,
            memorySize: 128,
            timeout: cdk.Duration.seconds(30),
            environment: {
                EVENTS_DDB: eventsDdb.tableName,
            },
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_143_0,
        });
    }
}
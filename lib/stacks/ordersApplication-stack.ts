import * as cdk from 'aws-cdk-lib';
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from 'constructs';

interface OrdersApplicationStackProps extends cdk.StackProps {
    productsDdb: dynamodb.Table,
}

export class OrdersApplicationStack extends cdk.Stack {
    readonly handler: lambdaNodeJS.NodejsFunction;

    constructor(scope: Construct, id: string, props: OrdersApplicationStackProps) {
        super(scope, id, props);

        // create a DynamoDB table
        const ordersDdb = this.createDynamoDBTable();

        // create a lambda function
        this.handler = this.createOrdersFunction(ordersDdb, props);

        // grant the product lambda function read access to the DynamoDB table
        props.productsDdb.grantReadData(this.handler);

        // grant the order lambda function read/write access to the DynamoDB table
        ordersDdb.grantReadWriteData(this.handler);
    }

    createDynamoDBTable(): dynamodb.Table {
        // create a DynamoDB table
        return new dynamodb.Table(this, "OrdersDdb", {
            tableName: "orders",
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            partitionKey: {
                name: "pk",
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: "sk",
                type: dynamodb.AttributeType.STRING,
            },
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 1,
            writeCapacity: 1,
        });
    }

    createOrdersFunction(ordersDdb: dynamodb.Table, props: OrdersApplicationStackProps) {
        return new lambdaNodeJS.NodejsFunction(this, "OrdersFunction", {
            functionName: "OrdersFunction",
            entry: "lambda/orders/ordersFunction.ts",
            handler: "handler",
            bundling: {
                minify: false,
                sourceMap: false,
            },
            tracing: lambda.Tracing.ACTIVE,
            memorySize: 128,
            timeout: cdk.Duration.seconds(30),
            environment: {
                PRODUCTS_DDB: props.productsDdb.tableName,
                ORDERS_DDB: ordersDdb.tableName,
            },
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_143_0
        });
    }
}
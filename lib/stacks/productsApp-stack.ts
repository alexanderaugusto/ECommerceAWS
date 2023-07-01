// Purpose: Define the stack for the products app.
import * as cdk from 'aws-cdk-lib';
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from 'constructs';
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

interface ProductsAppStackProps extends cdk.StackProps {
    productEventsFunction: lambdaNodeJS.NodejsFunction,
}

export class ProductsAppStack extends cdk.Stack {
    readonly handler: lambdaNodeJS.NodejsFunction; // lambda function handler for this stack

    constructor(scope: Construct, id: string, props: ProductsAppStackProps) {
        super(scope, id, props); // call the parent constructor

        // create a DynamoDB table
        const productsDdb = this.createDynamoDBTable();

        // create a lambda function
        this.handler = this.createProductsFunction(productsDdb, props);

        // grant the lambda function read/write access to the DynamoDB table
        productsDdb.grantReadWriteData(this.handler);

        // grant the lambda function invoke access to the lambda function
        props.productEventsFunction.grantInvoke(this.handler);
    }

    createProductsFunction(productsDdb: dynamodb.Table, props: ProductsAppStackProps) {
        // scope: Construct - the parent construct
        // id: string - the logical ID of the construct within the parent construct
        // props?: StackProps - stack properties
        return new lambdaNodeJS.NodejsFunction(this, "ProductsFunction", {
            functionName: "ProductsFunction", // name of the lambda function at AWS
            entry: "lambda/products/productsFunction.ts", // path to the lambda function handler
            handler: "handler", // name of the lambda function handler
            bundling: { // bundling options
                minify: false, // minify the code at AWS, this is used to debug the code - true: the code will be minified - false: the code will not be minified
                sourceMap: false, // generate source map files
            },
            memorySize: 128, // memory allocatted to the lamda function in MB at AWS
            timeout: cdk.Duration.seconds(10), // maximum execution time of the lambda function at AWS
            environment: { // environment variables
                PRODUCTS_DDB: productsDdb.tableName, // name of the DynamoDB table
                PRODUCT_EVENTS_FUNCTION_NAME: props.productEventsFunction.functionName, // name of the lambda function
            },
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_143_0
        });
    }

    createDynamoDBTable(): dynamodb.Table {
        // create a DynamoDB table
        const productsDdb = new dynamodb.Table(this, "ProductsDdb", {
            tableName: "products", // name of the DynamoDB table at AWS
            removalPolicy: cdk.RemovalPolicy.DESTROY, // remove the DynamoDB table when the stack is deleted
            partitionKey: { // partition key of the DynamoDB table
                name: "id", // name of the partition key
                type: dynamodb.AttributeType.STRING, // type of the partition key
            },
            billingMode: dynamodb.BillingMode.PROVISIONED, // pay for the provisioned throughput
            readCapacity: 1, // read capacity units
            writeCapacity: 1, // write capacity units
        });

        return productsDdb;
    }
}
import * as cdk from 'aws-cdk-lib';
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from 'constructs';
import * as iam from "aws-cdk-lib/aws-iam";

interface ProductsAppStackProps extends cdk.StackProps {
    productEventsFunction: lambdaNodeJS.NodejsFunction,
    eventsDdb: dynamodb.Table
}

export class ProductsAppStack extends cdk.Stack {
    readonly handler: lambdaNodeJS.NodejsFunction;
    readonly productsDdb: dynamodb.Table;

    constructor(scope: Construct, id: string, props: ProductsAppStackProps) {
        super(scope, id, props);

        this.productsDdb = this.createDynamoDBTable();

        this.handler = this.createProductsFunction(props);

        this.addPolicyToLambdaFunction(this.handler, props);

        this.productsDdb.grantReadWriteData(this.handler);

        props.productEventsFunction.grantInvoke(this.handler);
    }

    createProductsFunction(props: ProductsAppStackProps) {
        return new lambdaNodeJS.NodejsFunction(this, "ProductsFunction", {
            functionName: "ProductsFunction",
            entry: "lambda/products/productsFunction.ts",
            handler: "handler",
            bundling: {
                minify: false,
                sourceMap: false,
            },
            memorySize: 128,
            timeout: cdk.Duration.seconds(10),
            environment: {
                PRODUCTS_DDB: this.productsDdb.tableName,
                PRODUCT_EVENTS_FUNCTION_NAME: props.productEventsFunction.functionName,
            },
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_143_0
        });
    }

    createDynamoDBTable(): dynamodb.Table {
        const productsDdb = new dynamodb.Table(this, "ProductsDdb", {
            tableName: "products",
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            partitionKey: {
                name: "id",
                type: dynamodb.AttributeType.STRING,
            },
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 1,
            writeCapacity: 1,
        });

        return productsDdb;
    }

    addPolicyToLambdaFunction(productEventsHandler: lambdaNodeJS.NodejsFunction, props: ProductsAppStackProps) {
        const eventsDdbPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["dynamodb:PutItem"],
            resources: [props.eventsDdb.tableArn],
            conditions: {
                ['ForAllValues:StringLike']: {
                    'dynamodb:LeadingKeys': ['#product_*']
                }
            }
        })
        productEventsHandler.addToRolePolicy(eventsDdbPolicy);
    }
}
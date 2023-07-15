import * as cdk from 'aws-cdk-lib';
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from 'constructs';
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";

interface OrdersApplicationStackProps extends cdk.StackProps {
    productsDdb: dynamodb.Table,
    eventsDdb: dynamodb.Table
}

export class OrdersApplicationStack extends cdk.Stack {
    readonly handler: lambdaNodeJS.NodejsFunction;

    constructor(scope: Construct, id: string, props: OrdersApplicationStackProps) {
        super(scope, id, props);

        // create a DynamoDB table
        const ordersDdb = this.createDynamoDBTable();

        // create a SNS topic
        const ordersTopic = this.createSnsTopic();

        // create a lambda function
        this.handler = this.createOrdersFunction(ordersDdb, ordersTopic, props);

        // create a lambda function for order events
        const orderEventsHandler = this.createOrdersEventFunction(props);

        // create a lambda function for billing
        const billingHandler = this.createBillingFunction();

        this.addPolicyToLambdaFunction(orderEventsHandler, props);

        // grant the product lambda function read access to the DynamoDB table
        props.productsDdb.grantReadData(this.handler);

        // grant the order lambda function read/write access to the DynamoDB table
        ordersDdb.grantReadWriteData(this.handler);

        // grant the order lambda function publish access to the SNS topic
        ordersTopic.grantPublish(this.handler);

        // add a subscription to the SNS topic for the order events lambda function
        ordersTopic.addSubscription(new subs.LambdaSubscription(orderEventsHandler));

        // add a subscription to the SNS topic for the billing lambda function
        ordersTopic.addSubscription(new subs.LambdaSubscription(billingHandler, {
            filterPolicy: {
                eventType: sns.SubscriptionFilter.stringFilter({
                    allowlist: ["ORDER_CREATED"],
                }),
            },
        }));
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

    createOrdersFunction(ordersDdb: dynamodb.Table, ordersTopic: sns.Topic, props: OrdersApplicationStackProps) {
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
                ORDER_EVENTS_TOPIC_ARN: ordersTopic.topicArn
            },
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_143_0
        });
    }

    createOrdersEventFunction(props: OrdersApplicationStackProps) {
        return new lambdaNodeJS.NodejsFunction(this, "OrderEventsFunction",
            {
                functionName: "OrderEventsFunction",
                entry: "lambda/orders/orderEventsFunction.ts",
                handler: "handler",
                bundling: {
                    minify: false,
                    sourceMap: false,
                },
                tracing: lambda.Tracing.ACTIVE,
                memorySize: 128,
                timeout: cdk.Duration.seconds(30),
                environment: {
                    EVENTS_DDB: props.eventsDdb.tableName,
                },
                insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_143_0
            }
        );
    }

    createBillingFunction() {
        return new lambdaNodeJS.NodejsFunction(this, "BillingFunction.ts", {
            functionName: "BillingFunction",
            entry: "lambda/orders/billingFunction.ts",
            handler: "handler",
            bundling: {
                minify: false,
                sourceMap: false,
            },
            tracing: lambda.Tracing.ACTIVE,
            memorySize: 128,
            timeout: cdk.Duration.seconds(30),
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_143_0
        });
    }

    createSnsTopic(): sns.Topic {
        return new sns.Topic(this, "OrderEventsTopic", {
            displayName: "Order events topic",
            topicName: "order-events",
        });
    }

    addPolicyToLambdaFunction(orderEventsHandler: lambdaNodeJS.NodejsFunction, props: OrdersApplicationStackProps) {
        const eventsDdbPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["dynamodb:PutItem"],
            resources: [props.eventsDdb.tableArn],
            conditions: {
                ['ForAllValues:StringLike']: {
                    'dynamodb:LeadingKeys': ['#order_*']
                }
            }
        })
        orderEventsHandler.addToRolePolicy(eventsDdbPolicy);
    }
}
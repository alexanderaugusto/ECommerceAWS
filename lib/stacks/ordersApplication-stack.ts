import * as cdk from 'aws-cdk-lib';
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from 'constructs';
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sqs from "aws-cdk-lib/aws-sqs"
import * as lambdaEventSource from "aws-cdk-lib/aws-lambda-event-sources";

interface OrdersApplicationStackProps extends cdk.StackProps {
    productsDdb: dynamodb.Table,
    eventsDdb: dynamodb.Table
}

export class OrdersApplicationStack extends cdk.Stack {
    readonly handler: lambdaNodeJS.NodejsFunction;
    readonly orderEventsFetchHandler: lambdaNodeJS.NodejsFunction;

    constructor(scope: Construct, id: string, props: OrdersApplicationStackProps) {
        super(scope, id, props);

        const ordersDdb = this.createDynamoDBTable();

        const ordersTopic = this.createSnsTopic();

        this.handler = this.createOrdersFunction(ordersDdb, ordersTopic, props);

        const orderEventsHandler = this.createOrdersEventFunction(props);

        const orderEmailsHandler = this.createOrderEmailsFunction();

        this.orderEventsFetchHandler = this.createOrderEventsFetchFunction(props);

        const billingHandler = this.createBillingFunction();

        this.addPolicyToLambdaFunction(orderEventsHandler, props);

        props.productsDdb.grantReadData(this.handler);

        ordersDdb.grantReadWriteData(this.handler);

        ordersTopic.grantPublish(this.handler);

        ordersTopic.addSubscription(new subs.LambdaSubscription(orderEventsHandler));

        ordersTopic.addSubscription(new subs.LambdaSubscription(billingHandler, {
            filterPolicy: {
                eventType: sns.SubscriptionFilter.stringFilter({
                    allowlist: ["ORDER_CREATED"],
                }),
            },
        }));

        const orderEventsQueue = this.createOrderEventsQueue();

        ordersTopic.addSubscription(new subs.SqsSubscription(orderEventsQueue, {
            filterPolicy: {
                eventType: sns.SubscriptionFilter.stringFilter({
                    allowlist: ["ORDER_CREATED", "ORDER_DELETED"],
                }),
            },
        }));

        orderEmailsHandler.addEventSource(new lambdaEventSource.SqsEventSource(orderEventsQueue, {
            batchSize: 5,
            enabled: true,
            maxBatchingWindow: cdk.Duration.minutes(1)
        }));
        orderEventsQueue.grantConsumeMessages(orderEmailsHandler);

        const eventsFetchDdbPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:Query'],
            resources: [`${props.eventsDdb.tableArn}/index/emailIdx`],
        })
        this.orderEventsFetchHandler.addToRolePolicy(eventsFetchDdbPolicy)
    }

    createDynamoDBTable(): dynamodb.Table {
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

    createOrderEmailsFunction() {
        return new lambdaNodeJS.NodejsFunction(this, "OrderEmailsFunction",
            {
                functionName: "OrderEmailsFunction",
                entry: "lambda/orders/orderEmailsFunction.ts",
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

    createOrderEventsFetchFunction(props: OrdersApplicationStackProps) {
        return new lambdaNodeJS.NodejsFunction(this,
            'OrderEventsFetchFunction', {
            functionName: 'OrderEventsFetchFunction',
            entry: 'lambda/orders/orderEventsFetchFunction.ts',
            handler: 'handler',
            bundling: {
                minify: false,
                sourceMap: false,
            },
            tracing: lambda.Tracing.ACTIVE,
            memorySize: 128,
            timeout: cdk.Duration.seconds(30),
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_143_0,
            environment: {
                EVENTS_DDB: props.eventsDdb.tableName,
            },
        });
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

    createOrderEventsQueue(): sqs.Queue {
        const orderEventsDlq = new sqs.Queue(this, "OrderEventsDlq", {
            queueName: "order-events-dlq",
            enforceSSL: false,
            encryption: sqs.QueueEncryption.UNENCRYPTED,
            retentionPeriod: cdk.Duration.days(10)
        })

        const orderEventsQueue = new sqs.Queue(this, "OrderEventsQueue", {
            queueName: "order-events",
            enforceSSL: false,
            encryption: sqs.QueueEncryption.UNENCRYPTED,
            deadLetterQueue: {
                maxReceiveCount: 3,
                queue: orderEventsDlq
            }
        })

        return orderEventsQueue;
    }
}
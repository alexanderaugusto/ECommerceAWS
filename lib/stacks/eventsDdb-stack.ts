import * as cdk from 'aws-cdk-lib';
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import { Construct } from 'constructs';

export class EventsDdbStack extends cdk.Stack {
    readonly table: dynamodb.Table;

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        this.table = this.createDynamoDBTable();

        // this.enableAutoScaling(this.table);

        this.addGlobalSecondaryIndex(this.table);
    }

    createDynamoDBTable(): dynamodb.Table {
        const eventsDdb = new dynamodb.Table(this, "EventsDdb", {
            tableName: "events",
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            partitionKey: {
                name: "pk",
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: "sk",
                type: dynamodb.AttributeType.STRING,
            },
            timeToLiveAttribute: "ttl",
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            // readCapacity: 1,
            // writeCapacity: 1,
        });

        return eventsDdb;
    }

    enableAutoScaling(table: dynamodb.Table): void {
        const readScale = table.autoScaleReadCapacity({
            maxCapacity: 4,
            minCapacity: 1,
        });

        readScale.scaleOnUtilization({
            targetUtilizationPercent: 50,
            scaleInCooldown: cdk.Duration.seconds(60),
            scaleOutCooldown: cdk.Duration.seconds(60),
        });

        const writeScale = table.autoScaleWriteCapacity({
            maxCapacity: 4,
            minCapacity: 1,
        });

        writeScale.scaleOnUtilization({
            targetUtilizationPercent: 50,
            scaleInCooldown: cdk.Duration.seconds(60),
            scaleOutCooldown: cdk.Duration.seconds(60),
        });
    }

    addGlobalSecondaryIndex(table: dynamodb.Table): void {
        table.addGlobalSecondaryIndex({
            indexName: "emailIdx",
            partitionKey: {
                name: "email",
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: "sk",
                type: dynamodb.AttributeType.STRING,
            },
            projectionType: dynamodb.ProjectionType.ALL,
        });
    }
}
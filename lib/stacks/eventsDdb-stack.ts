import * as cdk from 'aws-cdk-lib';
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import { Construct } from 'constructs';

export class EventsDdbStack extends cdk.Stack {
    readonly table: dynamodb.Table;

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        this.table = this.createDynamoDBTable();
    }

    createDynamoDBTable(): dynamodb.Table {
        // create a DynamoDB table
        const eventsDdb = new dynamodb.Table(this, "EventsDdb", {
            tableName: "events", // name of the DynamoDB table at AWS
            removalPolicy: cdk.RemovalPolicy.DESTROY, // remove the DynamoDB table when the stack is deleted
            partitionKey: { // partition key of the DynamoDB table
                name: "pk", // name of the partition key
                type: dynamodb.AttributeType.STRING, // type of the partition key
            },
            sortKey: { // sort key of the DynamoDB table
                name: "sk", // name of the sort key
                type: dynamodb.AttributeType.STRING, // type of the sort key
            },
            timeToLiveAttribute: "ttl", // name of the TTL attribute
            billingMode: dynamodb.BillingMode.PROVISIONED, // pay for the provisioned throughput
            readCapacity: 1, // read capacity units
            writeCapacity: 1, // write capacity units
        });

        return eventsDdb;
    }
}
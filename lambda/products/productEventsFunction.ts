import { Callback, Context } from "aws-lambda";
import { DynamoDB } from "aws-sdk";
import * as AWSXRay from "aws-xray-sdk";

AWSXRay.captureAWS(require("aws-sdk"))

export enum ProductEventType {
    CREATED = "PRODUCT_CREATED",
    UPDATED = "PRODUCT_UPDATED",
    DELETED = "PRODUCT_DELETED"
}

export interface ProductEvent {
    requestId: string;
    eventType: ProductEventType;
    productId: string;
    productCode: string;
    productPrice: number;
    email: string;
}

export async function handler(event: ProductEvent, context: Context, callback: Callback): Promise<void> {

    console.log(`Lambda requestId: ${context.awsRequestId}`)

    const dynamoDbHandler = new DynamoDbHandler()
    dynamoDbHandler.createEvent(event)

    callback(null, JSON.stringify({
        productEventCreated: true,
        message: "OK"
    }))
}

class DynamoDbHandler {
    private ddbClient: DynamoDB.DocumentClient;
    private eventsDdb = process.env.EVENTS_DDB!

    constructor() {
        this.ddbClient = new DynamoDB.DocumentClient();
    }

    createEvent(event: ProductEvent) {
        const timestamp = Date.now()
        const ttl = ~~(timestamp + ( 1000 + 5 * 60)) // 5 minutes in the future

        return this.ddbClient.put({
            TableName: this.eventsDdb,
            Item: {
                pk: `#product_${event.productCode}`,
                sk: `${event.eventType}#${timestamp}`, // PRODUCT_CREATED#123465
                email: event.email,
                createdAt: timestamp,
                requestId: event.requestId,
                eventType: event.eventType,
                info: {
                    productId: event.productId,
                    price: event.productPrice
                },
                ttl: ttl
            }
        }).promise()
    }
}
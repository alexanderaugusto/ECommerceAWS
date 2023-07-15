import { Context, SNSEvent, SNSMessage } from "aws-lambda"
import { AWSError, DynamoDB } from "aws-sdk"
import * as AWSXRay from "aws-xray-sdk"
import { PromiseResult } from "aws-sdk/lib/request"

AWSXRay.captureAWS(require("aws-sdk"))

export enum OrderEventType {
    CREATED = "ORDER_CREATED",
    DELETED = "ORDER_DELETED"
}

export interface OrderEvent {
    email: string;
    orderId: string;
    shipping: {
        type: string;
        carrier: string;
    },
    billing: {
        payment: string;
        totalPrice: number;
    },
    productCodes: string[];
    requestId: string;
}

export interface OrderEventDdb {
    pk: string;
    sk: string;
    ttl: number;
    email: string;
    createdAt: number;
    requestId: string;
    eventType: string;
    info: {
        orderId: string;
        productCodes: string[];
        messageId: string;
    }
}

export const handler = async (event: SNSEvent, context: Context): Promise<void> => {
    //Criando um batch de promises
    const promises: Promise<PromiseResult<DynamoDB.DocumentClient.PutItemOutput, AWSError>>[] = []

    const dynamoDbHandler = new DynamoDbHandler()

    //processando paralelamente meus record
    event.Records.forEach((record) => {
        promises.push(dynamoDbHandler.createEvent(record.Sns))
    })

    await Promise.all(promises)

    return
}

class DynamoDbHandler {
    private ddbClient: DynamoDB.DocumentClient;
    private eventsDdb = process.env.EVENTS_DDB!

    constructor() {
        this.ddbClient = new DynamoDB.DocumentClient();
    }

    createEvent(body: SNSMessage) {
        const event = JSON.parse(body.Message) as OrderEvent
        const timestamp = Date.now()
        const ttl = ~~(timestamp / 1000 + 5 * 60)
        const eventType = body.MessageAttributes["eventType"].Value
        const orderEventDdb: OrderEventDdb = {
            pk: `#order_${event.orderId}`,
            sk: `${eventType}#${timestamp}`,
            ttl: ttl,
            email: event.email,
            createdAt: timestamp,
            requestId: event.requestId,
            eventType: eventType,
            info: {
                orderId: event.orderId,
                productCodes: event.productCodes,
                messageId: body.MessageId
            }
        }

        console.log(`Order event - MessageId: ${body.MessageId}`)

        return this.createOrderEvent(orderEventDdb)
    }

    createOrderEvent(orderEvent: OrderEventDdb) {
        return this.ddbClient.put({
            TableName: this.eventsDdb,
            Item: orderEvent
        }).promise()
    }
}
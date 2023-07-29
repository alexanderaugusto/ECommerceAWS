import { Context, SNSMessage, SQSEvent } from "aws-lambda"

export async function handler(event: SQSEvent, context: Context): Promise<void> {
    event.Records.forEach((record) => {
        const body = JSON.parse(record.body) as SNSMessage
        console.log(body)
    })
}
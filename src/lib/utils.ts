// i know better name
// also this file will add more to it basically it will have functions for the whole project

export function authErrorResponse(message: string): Response {
    return new Response(
        `<html>
      <head><title>Authentication Error</title></head>
      <body style="font-family: Inter, sans-serif; text-align: center; padding: 50px; background-color: #001B1F;">
        <h2 style="color: #E64545;">Authentication Error</h2>
        <p style="color: #F7F7F7;">${message}</p>
        <p style="color: #F7F7F7;">You can close this window and try again.</p>
      </body>
    </html>`,
        { status: 400, headers: { "Content-Type": "text/html" } },
    );
}

export function authSuccessResponse(): Response {
    return new Response(
        `<html>
      <head><title>Authentication Successful</title></head>
      <body style="font-family: Inter, sans-serif; text-align: center; padding: 50px; background-color: #001B1F;">
        <h2 style="color: #2AC769;">Authentication Successful!</h2>
        <p style="color: #F7F7F7;">You have successfully authenticated with Enkryptify.</p>
        <p style="color: #F7F7F7;">You can now close this window and return to your terminal.</p>
      </body>
    </html>`,
        { status: 200, headers: { "Content-Type": "text/html" } },
    );
}

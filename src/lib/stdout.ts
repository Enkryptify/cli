export async function writeStdout(value: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        process.stdout.write(value, (error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
}

import { Box, Text, render } from "ink";

function MessageDisplay({ message }: { message: string }) {
    return (
        <Box>
            <Text>{message}</Text>
        </Box>
    );
}

export function showMessage(message: string): void {
    const msg = render(<MessageDisplay message={message} />);
    setTimeout(() => {
        msg.unmount();
    }, 2000);
}

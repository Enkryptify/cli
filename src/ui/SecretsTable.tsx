import type { Secret } from "@/providers/base/Provider.js";
import { render } from "ink";

const { default: Table } = await import("ink-table");

export function showSecretsTable(secrets: Secret[]): void {
    // reason im mapping the secrets to a table data is because the table component expects an array of objects with the [key: string]: any;
    const tableData = secrets.map((secret) => ({
        name: secret.name,
        value: secret.value,
        isPersonal: secret.isPersonal,
        environmentId: secret.environmentId,
    }));

    render(<Table data={tableData} />);
}

import type { Secret } from "@/providers/base/Provider.js";
import { render } from "ink";

const { default: Table } = await import("ink-table");

export function showSecretsTable(secrets: Secret[]): void {
    const tableData = secrets.map((secret) => ({
        name: secret.name,
        value: secret.value,
        isPersonal: secret.isPersonal,
        environmentId: secret.environmentId,
    }));

    render(<Table data={tableData} />);
}

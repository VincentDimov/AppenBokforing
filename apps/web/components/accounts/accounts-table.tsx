import { Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { accountTypeLabels, type Account } from "@/lib/api/accounts";

interface AccountsTableProps {
  accounts: Account[];
  canManage: boolean;
  onEdit: (account: Account) => void;
}

export function AccountsTable({ accounts, canManage, onEdit }: Readonly<AccountsTableProps>) {
  return (
    <div className="table-frame" tabIndex={0}>
      <table className="w-full min-w-[48rem] text-left text-sm">
        <thead className="border-b border-border bg-surface-muted text-xs font-semibold tracking-[0.08em] text-muted uppercase">
          <tr>
            <th className="px-5 py-3.5 font-semibold sm:px-6">Konto</th>
            <th className="px-5 py-3.5 font-semibold">Kontonamn</th>
            <th className="px-5 py-3.5 font-semibold">Typ</th>
            <th className="px-5 py-3.5 font-semibold">Momskod</th>
            <th className="px-5 py-3.5 font-semibold">Status</th>
            {canManage ? (
              <th className="px-5 py-3.5 text-right font-semibold sm:px-6">Åtgärd</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => (
            <tr className="border-b border-border last:border-b-0" key={account.id}>
              <td className="whitespace-nowrap px-5 py-4 font-semibold text-secondary sm:px-6">
                {account.number}
              </td>
              <td className="max-w-96 px-5 py-4 text-secondary">
                <span className="block truncate font-medium">{account.name}</span>
                {account.description ? (
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {account.description}
                  </span>
                ) : null}
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-secondary">
                {accountTypeLabels[account.accountType]}
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-secondary">
                {account.vatCode?.code ?? "—"}
              </td>
              <td className="whitespace-nowrap px-5 py-4">
                <Badge variant={account.active ? "success" : "outline"}>
                  {account.active ? "Aktivt" : "Inaktivt"}
                </Badge>
              </td>
              {canManage ? (
                <td className="px-5 py-3 text-right sm:px-6">
                  <Button
                    aria-label={`Redigera konto ${account.number}`}
                    onClick={() => onEdit(account)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Pencil aria-hidden="true" className="size-4" />
                  </Button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

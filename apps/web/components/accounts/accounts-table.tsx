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
    <div className="overflow-x-auto">
      <table className="w-full min-w-[48rem] text-left text-sm">
        <thead className="border-b border-[#e3ecf0] bg-[#f7fafb] text-xs font-semibold tracking-[0.08em] text-[#668291] uppercase">
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
            <tr className="border-b border-[#edf2f4] last:border-b-0" key={account.id}>
              <td className="whitespace-nowrap px-5 py-4 font-semibold text-[#1f4960] sm:px-6">
                {account.number}
              </td>
              <td className="max-w-96 px-5 py-4 text-[#274f63]">
                <span className="block truncate font-medium">{account.name}</span>
                {account.description ? (
                  <span className="mt-0.5 block truncate text-xs text-[#758e9a]">
                    {account.description}
                  </span>
                ) : null}
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-[#58717e]">
                {accountTypeLabels[account.accountType]}
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-[#58717e]">
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

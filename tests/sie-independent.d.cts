export function validateIndependent(bytes: Uint8Array): {
  text: string;
  accounts: Map<string, { name: string; type?: string }>;
  opening: Map<string, bigint>;
  closing: Map<string, bigint>;
  vouchers: Array<{
    series: string;
    number: string;
    date: string;
    lines: Array<{ account: string; amount: bigint; date: string }>;
  }>;
};

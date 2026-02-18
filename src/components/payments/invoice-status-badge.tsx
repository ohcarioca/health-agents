import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

interface InvoiceStatusBadgeProps {
  status: string;
}

const STATUS_VARIANT: Record<string, "warning" | "danger" | "success" | "neutral"> = {
  pending: "warning",
  partial: "warning",
  overdue: "danger",
  paid: "success",
  cancelled: "neutral",
};

const STATUS_KEY: Record<string, string> = {
  pending: "filterPending",
  partial: "filterPending",
  overdue: "filterOverdue",
  paid: "filterPaid",
  cancelled: "filterCancelled",
};

export function InvoiceStatusBadge({ status }: InvoiceStatusBadgeProps) {
  const t = useTranslations("payments");
  return (
    <Badge variant={STATUS_VARIANT[status] ?? "neutral"}>
      {t(STATUS_KEY[status] ?? "filterPending")}
    </Badge>
  );
}

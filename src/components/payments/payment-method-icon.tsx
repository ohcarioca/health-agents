import { QrCode, FileText, CreditCard } from "lucide-react";

interface PaymentMethodIconProps {
  method: string;
  className?: string;
}

export function PaymentMethodIcon({ method, className = "size-4" }: PaymentMethodIconProps) {
  switch (method) {
    case "pix":
      return <QrCode className={className} style={{ color: "var(--success)" }} />;
    case "boleto":
      return <FileText className={className} style={{ color: "var(--warning)" }} />;
    case "credit_card":
      return <CreditCard className={className} style={{ color: "var(--accent)" }} />;
    default:
      return null;
  }
}

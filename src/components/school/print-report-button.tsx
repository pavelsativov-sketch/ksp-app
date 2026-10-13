"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintReportButton({ label = "Печать" }: { label?: string } = {}) {
  return <Button type="button" variant="outline" className="print:hidden" onClick={() => window.print()}><Printer /><span>{label}</span></Button>;
}

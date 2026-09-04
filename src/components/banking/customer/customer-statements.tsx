'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { formatCurrency, maskAccountNumber, formatDate } from '@/lib/store';
import {
  FileText, Download, Loader2, Calendar, FileSpreadsheet,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Account {
  id: string; type: string; nickname: string; accountNumber: string;
  routingNumber: string; balance: number;
}

interface StatementData {
  account: {
    id: string; nickname: string; type: string;
    accountNumber: string; routingNumber: string; currency: string;
  };
  customer: { id: string; name: string; email: string; address: string | null };
  period: { from: string; to: string };
  startingBalance: number;
  endingBalance: number;
  totalCredits: number;
  totalDebits: number;
  transactions: Array<{
    id: string; date: string; description: string; counterparty: string | null;
    memo: string | null; category: string; status: string; amount: number; direction: 'CREDIT' | 'DEBIT';
  }>;
  generatedAt: string;
}

export function CustomerStatements() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState<StatementData | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/accounts');
        const data = await res.json();
        setAccounts(data.accounts || []);
        if (data.accounts?.[0]) setAccountId(data.accounts[0].id);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function generatePreview() {
    if (!accountId) {
      toast.error('Select an account');
      return;
    }
    setGenerating(true);
    try {
      const url = `/api/statements?accountId=${accountId}&from=${from}&to=${to}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to generate statement');
        return;
      }
      setPreview(data);
      toast.success('Statement preview ready');
    } finally {
      setGenerating(false);
    }
  }

  function downloadPDF() {
    if (!preview) return;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;

    // Header band
    doc.setFillColor(92, 24, 24); // Arvest crimson
    doc.rect(0, 0, pageWidth, 70, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('ARVEST', margin, 32);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('PRIVATE BANKING', margin, 46);
    doc.setFontSize(10);
    doc.text('OFFICIAL ACCOUNT STATEMENT', pageWidth - margin, 32, { align: 'right' });
    doc.setFontSize(8);
    doc.text(`Generated ${formatDate(preview.generatedAt, { year: 'numeric', month: 'long', day: 'numeric' })}`, pageWidth - margin, 46, { align: 'right' });

    // Customer & account info
    doc.setTextColor(40, 40, 40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(preview.customer.name, margin, 100);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (preview.customer.address) doc.text(preview.customer.address, margin, 114);
    doc.text(preview.customer.email, margin, preview.customer.address ? 128 : 114);

    // Account box
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(250, 248, 245);
    doc.roundedRect(pageWidth - 260, 88, 220, 60, 4, 4, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(preview.account.nickname.toUpperCase(), pageWidth - 250, 104);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Account #: ${preview.account.accountNumber}`, pageWidth - 250, 117);
    doc.text(`Routing #: ${preview.account.routingNumber}`, pageWidth - 250, 128);
    doc.text(`Type: ${preview.account.type.replace('_', ' ')}`, pageWidth - 250, 139);

    // Period
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(`Statement Period: ${formatDate(preview.period.from)} – ${formatDate(preview.period.to)}`, margin, 160);

    // Summary
    doc.setFillColor(245, 240, 232);
    doc.rect(margin, 175, pageWidth - margin * 2, 60, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('STARTING BALANCE', margin + 12, 192);
    doc.text('TOTAL CREDITS', margin + 12 + (pageWidth - margin * 2) / 3, 192);
    doc.text('TOTAL DEBITS', margin + 12 + (pageWidth - margin * 2) * 2 / 3, 192);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(40, 40, 40);
    doc.text(formatCurrency(preview.startingBalance), margin + 12, 210);
    doc.setTextColor(22, 120, 70);
    doc.text(`+${formatCurrency(preview.totalCredits)}`, margin + 12 + (pageWidth - margin * 2) / 3, 210);
    doc.setTextColor(160, 30, 30);
    doc.text(`-${formatCurrency(preview.totalDebits)}`, margin + 12 + (pageWidth - margin * 2) * 2 / 3, 210);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('ENDING BALANCE', margin + 12, 226);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(40, 40, 40);
    doc.text(formatCurrency(preview.endingBalance), margin + 12, 240);

    // Transactions table
    autoTable(doc, {
      startY: 260,
      head: [['Date', 'Description', 'Category', 'Status', 'Amount']],
      body: preview.transactions.map(t => [
        formatDate(t.date),
        `${t.description}${t.counterparty ? `\n${t.counterparty}` : ''}`,
        t.category,
        t.status,
        `${t.direction === 'CREDIT' ? '+' : '-'}${formatCurrency(t.amount)}`,
      ]),
      styles: { fontSize: 8, cellPadding: 6, overflow: 'linebreak' },
      headStyles: { fillColor: [92, 24, 24], textColor: 255, fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 65 },
        3: { cellWidth: 55 },
        4: { cellWidth: 80, halign: 'right' },
      },
      alternateRowStyles: { fillColor: [250, 248, 245] },
      margin: { left: margin, right: margin },
    });

    // Footer
    const finalY = (doc as any).lastAutoTable?.finalY || 300;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text('This statement is generated for demonstration purposes only. Not a real financial document.', margin, finalY + 30);
    doc.text('Arvest Private Banking · Member FDIC · Equal Housing Lender', margin, finalY + 42);
    doc.text(`Page 1 of 1 · Statement ID: ARP-${Date.now().toString(36).toUpperCase()}`, margin, finalY + 54);

    doc.save(`Arvest-Statement-${preview.account.accountNumber.slice(-4)}-${from}-to-${to}.pdf`);
    toast.success('Statement downloaded');
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif-display text-2xl mb-1">Statements</h1>
        <p className="text-sm text-muted-foreground">Generate official account statements as PDF. Select an account and date range.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" /> Generate Statement
          </CardTitle>
          <CardDescription className="text-xs">Choose an account and the statement period, then preview or download.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nickname} · ••••{a.accountNumber.slice(-4)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>From date</Label>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input type="date" className="pl-8" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>To date</Label>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input type="date" className="pl-8" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={generatePreview} disabled={generating || !accountId}>
              {generating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />}
              Preview statement
            </Button>
            <Button onClick={downloadPDF} disabled={!preview} className="arvest-gradient text-white">
              <Download className="w-3.5 h-3.5 mr-1.5" /> Download PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Statement Preview</CardTitle>
              <Badge variant="outline" className="text-[10px]">{preview.transactions.length} transactions</Badge>
            </div>
            <CardDescription className="text-xs">
              {preview.account.nickname} · ••••{preview.account.accountNumber.slice(-4)} · {formatDate(preview.period.from)} to {formatDate(preview.period.to)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Summary tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <div className="p-3 rounded-lg bg-muted/40">
                <div className="text-[10px] text-muted-foreground tracking-wider">STARTING</div>
                <div className="text-lg font-serif-display">{formatCurrency(preview.startingBalance)}</div>
              </div>
              <div className="p-3 rounded-lg bg-emerald-50">
                <div className="text-[10px] text-emerald-700 tracking-wider">CREDITS</div>
                <div className="text-lg font-serif-display text-emerald-700">+{formatCurrency(preview.totalCredits)}</div>
              </div>
              <div className="p-3 rounded-lg bg-destructive/10">
                <div className="text-[10px] text-destructive tracking-wider">DEBITS</div>
                <div className="text-lg font-serif-display text-destructive">−{formatCurrency(preview.totalDebits)}</div>
              </div>
              <div className="p-3 rounded-lg bg-primary/10">
                <div className="text-[10px] text-primary tracking-wider">ENDING</div>
                <div className="text-lg font-serif-display text-primary">{formatCurrency(preview.endingBalance)}</div>
              </div>
            </div>

            {/* Transaction list */}
            <div className="rounded-md border border-border max-h-96 overflow-y-auto arvest-scroll">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                  <tr className="text-left text-muted-foreground">
                    <th className="p-2 font-medium">Date</th>
                    <th className="p-2 font-medium">Description</th>
                    <th className="p-2 font-medium">Category</th>
                    <th className="p-2 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.transactions.map(t => (
                    <tr key={t.id} className="border-t border-border">
                      <td className="p-2 whitespace-nowrap">{formatDate(t.date)}</td>
                      <td className="p-2">{t.description}</td>
                      <td className="p-2"><Badge variant="outline" className="text-[9px]">{t.category}</Badge></td>
                      <td className={`p-2 text-right font-medium ${t.direction === 'CREDIT' ? 'text-emerald-700' : 'text-foreground'}`}>
                        {t.direction === 'CREDIT' ? '+' : '−'}{formatCurrency(t.amount)}
                      </td>
                    </tr>
                  ))}
                  {preview.transactions.length === 0 && (
                    <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No transactions in this period</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

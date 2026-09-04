'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AddressAutocomplete } from '@/components/banking/address-autocomplete';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/store';
import {
  Snowflake, Eye, EyeOff, Lock, Unlock, CreditCard, Plus, Shield,
  Wifi, MapPin, X, Loader2,
} from 'lucide-react';

interface BankCard {
  id: string;
  issuedBy: 'ARVEST' | 'EXTERNAL';
  cardType: 'DEBIT' | 'CREDIT';
  network: 'VISA' | 'MASTERCARD' | 'AMEX' | 'DISCOVER';
  cardholder: string;
  cardNumber: string;
  expiryMonth: number;
  expiryYear: number;
  cvv: string;
  color: 'CRIMSON' | 'GOLD' | 'OBSIDIAN' | 'PLATINUM' | 'SAPPHIRE' | 'EMERALD';
  status: 'ACTIVE' | 'FROZEN' | 'LOST' | 'CLOSED';
  creditLimit: number;
  creditUsed: number;
  nickname?: string | null;
  billingAddress?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingZip?: string | null;
  billingCountry?: string | null;
  account: { id: string; nickname: string; accountNumber: string; type: string } | null;
}

const colorStyles: Record<string, string> = {
  CRIMSON: 'from-[#5a1818] via-[#7a1d1d] to-[#3d0f0f]',
  GOLD: 'from-[#6b5520] via-[#8a6e2b] to-[#4d3a14]',
  OBSIDIAN: 'from-[#1a1a1a] via-[#2a2a2a] to-[#0a0a0a]',
  PLATINUM: 'from-[#5a5a5a] via-[#7c7c7c] to-[#3a3a3a]',
  SAPPHIRE: 'from-[#1a2b5a] via-[#2a3f7c] to-[#0a1530]',
  EMERALD: 'from-[#1a4a3a] via-[#2a6b54] to-[#0a3020]',
};

export function CustomerCards() {
  const [cards, setCards] = useState<BankCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [detailsOpen, setDetailsOpen] = useState<BankCard | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  // Add external card dialog
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [cardholder, setCardholder] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardType, setCardType] = useState<'DEBIT' | 'CREDIT'>('DEBIT');
  const [network, setNetwork] = useState<'VISA' | 'MASTERCARD' | 'AMEX' | 'DISCOVER'>('VISA');
  const [nickname, setNickname] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [billingState, setBillingState] = useState('');
  const [billingZip, setBillingZip] = useState('');

  async function load() {
    try {
      const res = await fetch('/api/cards');
      const data = await res.json();
      setCards(data.cards || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function toggleFreeze(card: BankCard) {
    setUpdating(card.id);
    try {
      const newStatus = card.status === 'FROZEN' ? 'ACTIVE' : 'FROZEN';
      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) { toast.error('Failed to update card'); return; }
      toast.success(newStatus === 'FROZEN' ? 'Card frozen' : 'Card activated');
      load();
    } finally {
      setUpdating(null);
    }
  }

  function detectNetwork(num: string): 'VISA' | 'MASTERCARD' | 'AMEX' | 'DISCOVER' {
    const clean = (num || '').replace(/\s/g, '').replace(/[^0-9]/g, '');
    if (!clean) return 'VISA';
    // Visa: starts with 4
    if (clean.startsWith('4')) return 'VISA';
    // Mastercard: starts with 51-55 or 2221-2720
    if (/^5[1-5]/.test(clean)) return 'MASTERCARD';
    if (/^2(2[2-9]|[3-6][0-9]|7[0-1]|720)/.test(clean)) return 'MASTERCARD';
    // Amex: starts with 34 or 37
    if (clean.startsWith('34') || clean.startsWith('37')) return 'AMEX';
    // Discover: starts with 6011, 622126-622925, 644-649, or 65
    if (clean.startsWith('6011')) return 'DISCOVER';
    if (clean.startsWith('65')) return 'DISCOVER';
    if (/^64[4-9]/.test(clean)) return 'DISCOVER';
    if (/^62[2-9]/.test(clean) && clean.length >= 6) return 'DISCOVER';
    // Default fallback
    return 'VISA';
  }

  function formatCardNumber(num: string): string {
    const clean = num.replace(/\s/g, '');
    if (clean.length >= 16) return clean.match(/.{1,4}/g)?.join(' ') || clean;
    return clean;
  }

  async function addExternalCard() {
    if (!cardNumber || !cardholder || !cvv || !expiryMonth || !expiryYear) {
      toast.error('Please fill all card fields');
      return;
    }
    if (!billingAddress || !billingCity || !billingState || !billingZip) {
      toast.error('Billing address is required');
      return;
    }
    // ALWAYS auto-detect the network from the card number — this ensures
    // the stored network matches the actual card type regardless of what
    // the dropdown/state was showing.
    const cleanNumber = cardNumber.replace(/\s/g, '');
    const detectedNetwork = detectNetwork(cleanNumber);
    setNetwork(detectedNetwork); // update state for UI consistency

    setAdding(true);
    try {
      const res = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardType,
          network: detectedNetwork,  // use the auto-detected network
          cardholder,
          cardNumber: cleanNumber,
          expiryMonth: parseInt(expiryMonth), expiryYear: parseInt(expiryYear),
          cvv, color: 'OBSIDIAN', nickname,
          billingAddress, billingCity, billingState, billingZip,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to add card'); return; }
      toast.success(`${detectedNetwork} card added successfully`);
      setAddOpen(false);
      setCardNumber(''); setCardholder(''); setExpiryMonth(''); setExpiryYear(''); setCvv(''); setNickname('');
      setBillingAddress(''); setBillingCity(''); setBillingState(''); setBillingZip('');
      setNetwork('VISA'); // reset to default
      load();
    } finally { setAdding(false); }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid md:grid-cols-2 gap-6">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      </div>
    );
  }

  const arvestCards = cards.filter(c => c.issuedBy === 'ARVEST');
  const externalCards = cards.filter(c => c.issuedBy === 'EXTERNAL');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif-display text-2xl mb-1">Cards</h1>
          <p className="text-sm text-muted-foreground">Manage your Arvest-issued cards and add external cards.</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="arvest-gradient text-white">
          <Plus className="w-4 h-4 mr-1.5" /> Add external card
        </Button>
      </div>

      {cards.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground mb-4">No cards yet. Add an external card to get started.</p>
            <Button onClick={() => setAddOpen(true)} className="arvest-gradient text-white">
              <Plus className="w-4 h-4 mr-1.5" /> Add external card
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Arvest-issued cards section */}
          {arvestCards.length > 0 && (
            <div>
              <div className="text-xs tracking-[0.2em] text-muted-foreground mb-3 flex items-center gap-2">
                <Shield className="w-3.5 h-3.5" /> ARVEST-ISSUED CARDS
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {arvestCards.map(card => (
                  <CardBlock
                    key={card.id} card={card}
                    revealed={revealed} setRevealed={setRevealed}
                    onShowDetails={() => setDetailsOpen(card)}
                    onToggleFreeze={() => toggleFreeze(card)}
                    updating={updating === card.id}
                  />
                ))}
              </div>
            </div>
          )}

          {/* External cards section */}
          {externalCards.length > 0 && (
            <div>
              <div className="text-xs tracking-[0.2em] text-muted-foreground mb-3 flex items-center gap-2">
                <CreditCard className="w-3.5 h-3.5" /> EXTERNAL CARDS
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {externalCards.map(card => (
                  <CardBlock
                    key={card.id} card={card}
                    revealed={revealed} setRevealed={setRevealed}
                    onShowDetails={() => setDetailsOpen(card)}
                    onToggleFreeze={() => toggleFreeze(card)}
                    updating={updating === card.id}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Card details modal */}
      <Dialog open={!!detailsOpen} onOpenChange={(o) => !o && setDetailsOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailsOpen?.issuedBy === 'ARVEST' ? (
                <><Shield className="w-4 h-4 text-primary" /> Arvest-issued card</>
              ) : (
                <><CreditCard className="w-4 h-4" /> External card {detailsOpen?.nickname && `· ${detailsOpen.nickname}`}</>
              )}
            </DialogTitle>
            <DialogDescription>Full card information for {detailsOpen?.cardholder}</DialogDescription>
          </DialogHeader>
          {detailsOpen && (
            <div className="space-y-3 text-sm">
              <DetailRow label="Card type" value={`${detailsOpen.cardType} · ${detailsOpen.network}`} />
              <DetailRow label="Cardholder" value={detailsOpen.cardholder} />
              <DetailRow label="Card number" value={detailsOpen.cardNumber.match(/.{1,4}/g)?.join(' ') || ''} mono />
              <DetailRow label="Expiry" value={`${String(detailsOpen.expiryMonth).padStart(2, '0')}/${detailsOpen.expiryYear}`} mono />
              <DetailRow label="CVV" value={detailsOpen.cvv} mono />
              <DetailRow label="Status" value={detailsOpen.status} />

              {/* Linked account — only for Arvest-issued cards */}
              {detailsOpen.issuedBy === 'ARVEST' && detailsOpen.account && (
                <DetailRow label="Linked account" value={`${detailsOpen.account.nickname} (••••${detailsOpen.account.accountNumber.slice(-4)})`} />
              )}

              {/* Billing address — only for external cards (Arvest never exposes this) */}
              {detailsOpen.issuedBy === 'EXTERNAL' && (
                <div className="pt-3 border-t border-border">
                  <div className="text-xs text-muted-foreground tracking-wider mb-2 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> BILLING ADDRESS
                  </div>
                  <div className="text-sm">
                    {detailsOpen.cardholder}<br />
                    {detailsOpen.billingAddress}<br />
                    {detailsOpen.billingCity}, {detailsOpen.billingState} {detailsOpen.billingZip}<br />
                    {detailsOpen.billingCountry}
                  </div>
                </div>
              )}

              {/* Credit info for credit cards */}
              {detailsOpen.cardType === 'CREDIT' && detailsOpen.issuedBy === 'ARVEST' && (
                <>
                  <DetailRow label="Credit limit" value={formatCurrency(detailsOpen.creditLimit)} />
                  <DetailRow label="Used" value={formatCurrency(detailsOpen.creditUsed)} />
                  <DetailRow label="Available" value={formatCurrency(detailsOpen.creditLimit - detailsOpen.creditUsed)} />
                </>
              )}

              <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2 mt-4">
                <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>Never share your CVV or PIN with anyone. Arvest will never ask for these details by phone or email.</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== Add external card dialog ===== */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add External Card</DialogTitle>
            <DialogDescription>Link a card from another financial institution. Billing address is required for verification.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Cardholder name</Label>
              <Input value={cardholder} onChange={(e) => setCardholder(e.target.value)} placeholder="Name on card" />
            </div>
            <div className="space-y-2">
              <Label>Card number</Label>
              <Input
                value={cardNumber}
                onChange={(e) => {
                  const v = e.target.value.replace(/\s/g, '').replace(/[^0-9]/g, '');
                  const formatted = v.match(/.{1,4}/g)?.join(' ') || v;
                  setCardNumber(formatted);
                  // Auto-detect network on every keystroke
                  if (v.length >= 1) setNetwork(detectNetwork(v));
                }}
                placeholder="0000 0000 0000 0000"
                maxLength={19}
              />
              {/* Live network badge preview */}
              {cardNumber && cardNumber.replace(/\s/g, '').length >= 1 && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-muted-foreground">Detected:</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-primary/10 text-primary border border-primary/20">
                    {network === 'VISA' && 'VISA'}
                    {network === 'MASTERCARD' && 'MASTERCARD'}
                    {network === 'AMEX' && 'AMERICAN EXPRESS'}
                    {network === 'DISCOVER' && 'DISCOVER'}
                  </span>
                  <span className="text-[10px] text-muted-foreground italic">— will be set automatically</span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Month</Label>
                <Input type="number" min="1" max="12" value={expiryMonth} onChange={(e) => setExpiryMonth(e.target.value)} placeholder="MM" />
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Input type="number" min="26" max="40" value={expiryYear} onChange={(e) => setExpiryYear(e.target.value)} placeholder="YY" />
              </div>
              <div className="space-y-2">
                <Label>CVV</Label>
                <Input type="number" maxLength={4} value={cvv} onChange={(e) => setCvv(e.target.value)} placeholder="123" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Card type</Label>
                <Select value={cardType} onValueChange={(v) => setCardType(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEBIT">Debit</SelectItem>
                    <SelectItem value="CREDIT">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nickname (optional)</Label>
                <Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="e.g. Travel card" />
              </div>
            </div>

            <div className="pt-3 border-t border-border">
              <div className="text-xs text-muted-foreground tracking-wider mb-2 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> BILLING ADDRESS
              </div>
              <div className="space-y-2">
                <AddressAutocomplete
                  value={billingAddress}
                  onChange={setBillingAddress}
                  onAddressSelect={(addr) => {
                    setBillingAddress(addr.street);
                    setBillingCity(addr.city);
                    setBillingState(addr.state);
                    setBillingZip(addr.zip);
                  }}
                  placeholder="Start typing street address…"
                />
                <div className="grid grid-cols-3 gap-2">
                  <Input value={billingCity} onChange={(e) => setBillingCity(e.target.value)} placeholder="City" />
                  <Input value={billingState} onChange={(e) => setBillingState(e.target.value)} placeholder="State" />
                  <Input value={billingZip} onChange={(e) => setBillingZip(e.target.value)} placeholder="ZIP" />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={addExternalCard} disabled={adding} className="arvest-gradient text-white">
              {adding ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Adding…</> : <><Plus className="w-4 h-4 mr-2" /> Add card</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CardBlock({ card, revealed, setRevealed, onShowDetails, onToggleFreeze, updating }: {
  card: BankCard;
  revealed: Record<string, boolean>;
  setRevealed: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onShowDetails: () => void;
  onToggleFreeze: () => void;
  updating: boolean;
}) {
  const isExternal = card.issuedBy === 'EXTERNAL';
  return (
    <div className="space-y-3">
      {/* Virtual card */}
      <div className={`relative aspect-[1.586] rounded-2xl p-5 bg-gradient-to-br ${colorStyles[card.color]} text-white shadow-xl overflow-hidden`}>
        <div className="absolute inset-0 opacity-20" style={{
          background: 'radial-gradient(circle at 20% 80%, rgba(255,255,255,0.4) 0%, transparent 50%)',
        }} />
        <div className="relative flex items-start justify-between">
          <div>
            <div className="text-[10px] tracking-[0.3em] text-white/70">
              {isExternal ? 'EXTERNAL CARD' : 'ARVEST PRIVATE'}
            </div>
            <div className="text-sm font-medium mt-0.5">
              {card.nickname && isExternal ? card.nickname : `${card.cardType === 'CREDIT' ? 'Platinum Credit' : 'Debit'}`}
            </div>
          </div>
          <div className="text-right">
            {card.status === 'FROZEN' && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 text-[10px] tracking-wider backdrop-blur-sm">
                <Snowflake className="w-2.5 h-2.5" /> FROZEN
              </div>
            )}
            {card.status === 'ACTIVE' && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-400/20 text-[10px] tracking-wider backdrop-blur-sm">
                <Shield className="w-2.5 h-2.5" /> ACTIVE
              </div>
            )}
          </div>
        </div>

        <div className="relative flex items-center gap-3 mt-4">
          <div className="w-10 h-7 rounded-md bg-gradient-to-br from-yellow-200 to-yellow-400 shadow-inner" />
          <Wifi className="w-5 h-5 text-white/70 rotate-90" />
        </div>

        <div className="relative mt-4 font-mono text-base lg:text-lg tracking-wider">
          {revealed[card.id]
            ? card.cardNumber.match(/.{1,4}/g)?.join(' ')
            : `•••• •••• •••• ${card.cardNumber.slice(-4)}`}
        </div>

        <div className="relative flex items-end justify-between mt-4">
          <div>
            <div className="text-[9px] text-white/60 tracking-wider">CARDHOLDER</div>
            <div className="text-xs font-medium tracking-wide">{card.cardholder}</div>
          </div>
          <div>
            <div className="text-[9px] text-white/60 tracking-wider">EXPIRES</div>
            <div className="text-xs font-mono">{String(card.expiryMonth).padStart(2, '0')}/{String(card.expiryYear).slice(-2)}</div>
          </div>
          <div className="text-right font-serif-display text-lg lg:text-xl italic tracking-wide">
            {card.network === 'VISA' && 'VISA'}
            {card.network === 'MASTERCARD' && 'Mastercard'}
            {card.network === 'AMEX' && 'AMEX'}
            {card.network === 'DISCOVER' && 'DISCOVER'}
          </div>
        </div>

        {/* Show billing address badge on external cards */}
        {isExternal && (
          <div className="absolute bottom-2 left-5 text-[9px] text-white/60 flex items-center gap-1">
            <MapPin className="w-2.5 h-2.5" /> {card.billingCity}, {card.billingState}
          </div>
        )}
      </div>

      {/* Card meta + actions */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs text-muted-foreground">
                {isExternal ? (card.nickname || 'External card') : 'Linked to'}
              </div>
              <div className="text-sm font-medium">
                {isExternal ? `${card.network} ${card.cardType}` : (card.account?.nickname || 'Standalone')}
              </div>
            </div>
            {card.cardType === 'CREDIT' && card.issuedBy === 'ARVEST' ? (
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Available credit</div>
                <div className="text-sm font-medium">{formatCurrency(card.creditLimit - card.creditUsed)}</div>
              </div>
            ) : (
              <Badge variant="outline" className="text-[10px]">{card.cardType}</Badge>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm" variant="outline"
              onClick={() => setRevealed(prev => ({ ...prev, [card.id]: !prev[card.id] }))}
            >
              {revealed[card.id] ? <><EyeOff className="w-3.5 h-3.5 mr-1.5" /> Hide details</> : <><Eye className="w-3.5 h-3.5 mr-1.5" /> Show details</>}
            </Button>
            <Button size="sm" variant="outline" onClick={onShowDetails}>
              <CreditCard className="w-3.5 h-3.5 mr-1.5" /> Full info
            </Button>
            <Button
              size="sm"
              variant={card.status === 'FROZEN' ? 'default' : 'outline'}
              onClick={onToggleFreeze}
              disabled={updating}
              className={card.status !== 'FROZEN' ? 'text-amber-700 border-amber-300 hover:bg-amber-50' : 'arvest-gradient text-white'}
            >
              {card.status === 'FROZEN'
                ? <><Unlock className="w-3.5 h-3.5 mr-1.5" /> Unfreeze</>
                : <><Snowflake className="w-3.5 h-3.5 mr-1.5" /> Freeze</>}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`text-sm font-medium ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

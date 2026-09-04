'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AddressAutocomplete } from '@/components/banking/address-autocomplete';
import { toast } from 'sonner';
import { Landmark, Phone, Clock, MapPin, Navigation, Search, AlertCircle } from 'lucide-react';

interface Branch {
  id: string; name: string; address: string; phone: string;
  hours: string; lat: number; lng: number; services: string[];
}

export function CustomerBranches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/branches');
        const data = await res.json();
        setBranches(data.branches || []);
      } catch {
        toast.error('Failed to load branches');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Simple filter: match against address text. Photon geocoder is the "autocomplete".
  const filtered = query.trim().length === 0
    ? branches
    : branches.filter((b) => {
        const q = query.toLowerCase();
        return (
          b.address.toLowerCase().includes(q) ||
          b.name.toLowerCase().includes(q)
        );
      });

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
        <h1 className="font-serif-display text-2xl mb-1 flex items-center gap-2">
          <Landmark className="w-6 h-6 text-primary" /> Find Branches
        </h1>
        <p className="text-sm text-muted-foreground">Locate an Arvest Private Banking branch near you.</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <AddressAutocomplete
              value={query}
              onChange={setQuery}
              placeholder="Search by address, city, or ZIP…"
              className="flex-1"
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Showing {filtered.length} of {branches.length} branches
          </p>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <AlertCircle className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
            <div className="text-sm font-medium">There's no bank in this location</div>
            <div className="text-xs text-muted-foreground mt-1">
              We couldn't find a branch matching "{query}". Try a different city or address — Arvest Private Banking currently serves AR, MO, and OK.
            </div>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setQuery('')}>
              Show all branches
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((b) => (
            <Card key={b.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                      <Landmark className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="font-serif-display text-base">{b.name}</div>
                      <div className="text-[11px] text-muted-foreground">{b.hours}</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 text-sm">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 text-muted-foreground" />
                    <span>{b.address}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                    <a href={`tel:${b.phone}`} className="hover:underline">{b.phone}</a>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">{b.hours}</span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {b.services.map((s) => (
                    <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-3"
                  asChild
                >
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(b.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Navigation className="w-3.5 h-3.5 mr-1.5" /> Get directions
                  </a>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

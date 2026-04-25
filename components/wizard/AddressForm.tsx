'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const US_STATES = [
  ['AL', 'Alabama'],
  ['AK', 'Alaska'],
  ['AZ', 'Arizona'],
  ['AR', 'Arkansas'],
  ['CA', 'California'],
  ['CO', 'Colorado'],
  ['CT', 'Connecticut'],
  ['DE', 'Delaware'],
  ['FL', 'Florida'],
  ['GA', 'Georgia'],
  ['HI', 'Hawaii'],
  ['ID', 'Idaho'],
  ['IL', 'Illinois'],
  ['IN', 'Indiana'],
  ['IA', 'Iowa'],
  ['KS', 'Kansas'],
  ['KY', 'Kentucky'],
  ['LA', 'Louisiana'],
  ['ME', 'Maine'],
  ['MD', 'Maryland'],
  ['MA', 'Massachusetts'],
  ['MI', 'Michigan'],
  ['MN', 'Minnesota'],
  ['MS', 'Mississippi'],
  ['MO', 'Missouri'],
  ['MT', 'Montana'],
  ['NE', 'Nebraska'],
  ['NV', 'Nevada'],
  ['NH', 'New Hampshire'],
  ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'],
  ['NY', 'New York'],
  ['NC', 'North Carolina'],
  ['ND', 'North Dakota'],
  ['OH', 'Ohio'],
  ['OK', 'Oklahoma'],
  ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'],
  ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'],
  ['SD', 'South Dakota'],
  ['TN', 'Tennessee'],
  ['TX', 'Texas'],
  ['UT', 'Utah'],
  ['VT', 'Vermont'],
  ['VA', 'Virginia'],
  ['WA', 'Washington'],
  ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'],
  ['WY', 'Wyoming'],
];

export interface AddressValue {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  inCareOf?: string;
}

interface AddressFormProps {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  showInCareOf?: boolean;
  floridaOnly?: boolean;
  prefix?: string;
}

export function AddressForm({
  value,
  onChange,
  showInCareOf,
  floridaOnly,
  prefix = '',
}: AddressFormProps) {
  const set = <K extends keyof AddressValue>(key: K, v: AddressValue[K]) =>
    onChange({ ...value, [key]: v });
  const id = (k: string) => `${prefix}${k}`;

  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
      {showInCareOf && (
        <div className="md:col-span-6 space-y-1.5">
          <Label htmlFor={id('inCareOf')}>In care of (optional)</Label>
          <Input
            id={id('inCareOf')}
            value={value.inCareOf ?? ''}
            onChange={(e) => set('inCareOf', e.target.value)}
            placeholder="c/o Acme Holdings"
          />
        </div>
      )}

      <div className="md:col-span-4 space-y-1.5">
        <Label htmlFor={id('street1')}>
          Street address <span className="text-destructive">*</span>
        </Label>
        <Input
          id={id('street1')}
          value={value.street1}
          onChange={(e) => set('street1', e.target.value)}
          placeholder="500 Brickell Avenue"
          autoComplete="address-line1"
          required
        />
      </div>

      <div className="md:col-span-2 space-y-1.5">
        <Label htmlFor={id('street2')}>Suite / Unit</Label>
        <Input
          id={id('street2')}
          value={value.street2 ?? ''}
          onChange={(e) => set('street2', e.target.value)}
          placeholder="Suite 1200"
          autoComplete="address-line2"
        />
      </div>

      <div className="md:col-span-3 space-y-1.5">
        <Label htmlFor={id('city')}>
          City <span className="text-destructive">*</span>
        </Label>
        <Input
          id={id('city')}
          value={value.city}
          onChange={(e) => set('city', e.target.value)}
          placeholder="Miami"
          autoComplete="address-level2"
          required
        />
      </div>

      <div className="md:col-span-2 space-y-1.5">
        <Label htmlFor={id('state')}>
          State <span className="text-destructive">*</span>
        </Label>
        {floridaOnly ? (
          <Input id={id('state')} value="FL" disabled />
        ) : (
          <Select value={value.state || 'FL'} onValueChange={(v) => set('state', v)}>
            <SelectTrigger id={id('state')}>
              <SelectValue placeholder="State" />
            </SelectTrigger>
            <SelectContent>
              {US_STATES.map(([code, name]) => (
                <SelectItem key={code} value={code}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="md:col-span-1 space-y-1.5">
        <Label htmlFor={id('zip')}>
          ZIP <span className="text-destructive">*</span>
        </Label>
        <Input
          id={id('zip')}
          value={value.zip}
          onChange={(e) => set('zip', e.target.value)}
          placeholder="33131"
          autoComplete="postal-code"
          maxLength={10}
          required
        />
      </div>
    </div>
  );
}

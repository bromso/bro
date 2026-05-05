# UI Components

All UI components are imported from `@repo/ui` (which maps to `packages/ui/src/index.ts`).

**Never install additional UI libraries.** The build produces a single HTML file — external dependencies increase bundle size. Use what's available.

## Available Components

### Inputs

```tsx
import { Input, Textarea, Checkbox, Switch, Label, RadioGroup, RadioGroupItem, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui";

// Text input
<Input placeholder="Enter a name..." value={name} onChange={e => setName(e.target.value)} />

// Multiline text
<Textarea placeholder="Enter description..." rows={3} />

// Checkbox with label
<div className="flex items-center gap-2">
  <Checkbox id="opt1" checked={enabled} onCheckedChange={setEnabled} />
  <Label htmlFor="opt1">Enable feature</Label>
</div>

// Toggle switch
<div className="flex items-center gap-2">
  <Switch id="sw1" checked={on} onCheckedChange={setOn} />
  <Label htmlFor="sw1">Dark mode</Label>
</div>

// Radio group
<RadioGroup value={choice} onValueChange={setChoice}>
  <div className="flex items-center gap-2">
    <RadioGroupItem value="a" id="r1" />
    <Label htmlFor="r1">Option A</Label>
  </div>
  <div className="flex items-center gap-2">
    <RadioGroupItem value="b" id="r2" />
    <Label htmlFor="r2">Option B</Label>
  </div>
</RadioGroup>

// Dropdown select
<Select value={selected} onValueChange={setSelected}>
  <SelectTrigger><SelectValue placeholder="Choose..." /></SelectTrigger>
  <SelectContent>
    <SelectItem value="opt1">Option 1</SelectItem>
    <SelectItem value="opt2">Option 2</SelectItem>
  </SelectContent>
</Select>
```

### Buttons

```tsx
import { Button, IconButton } from "@repo/ui";

<Button onClick={handleClick}>Do something</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="outline">Settings</Button>
<Button variant="destructive">Delete</Button>
<Button disabled>Loading...</Button>

// Icon button (square, icon only)
<IconButton iconProps={{ name: "lucide:plus" }} aria-label="Add" onClick={handleAdd} />
```

Button variants: `default`, `secondary`, `outline`, `ghost`, `destructive`, `link`
Button sizes: `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`

### Display

```tsx
import { Icon, SectionTitle, Type, Alert, AlertDescription, Label } from "@repo/ui";

// Icons (lucide icon set via iconify)
<Icon name="lucide:plus" />
<Icon name="lucide:info" />
<Icon name="lucide:star" />

// Section heading
<SectionTitle>Settings</SectionTitle>

// Typography (polymorphic — renders as p, h1, h2, span, etc.)
<Type size="large" weight="bold">Heading</Type>
<Type size="small">Body text</Type>
<Type as="h2" size="xlarge" weight="bold">Page Title</Type>

// Info/warning alert
<Alert>
  <Icon name="lucide:info" className="size-4" />
  <AlertDescription>Select at least one layer to continue.</AlertDescription>
</Alert>

// Label for form fields
<Label htmlFor="input1">Layer name</Label>
```

Type sizes: `xsmall` (11px), `small` (12px), `large` (13px), `xlarge` (14px)
Type weights: `normal`, `medium`, `bold`
Type `as` prop: `p` (default), `span`, `div`, `h1`-`h6`, `label`

### Layout

```tsx
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@repo/ui";

// Collapsible sections
<Accordion type="single" collapsible>
  <AccordionItem value="section-1">
    <AccordionTrigger>Advanced Settings</AccordionTrigger>
    <AccordionContent>
      {/* Settings content here */}
    </AccordionContent>
  </AccordionItem>
</Accordion>
```

## Styling with Tailwind CSS

Components accept a `className` prop for Tailwind utilities:

```tsx
// Layout
<div className="flex flex-col gap-2 p-4">        {/* Vertical stack with spacing */}
<div className="flex items-center gap-2">          {/* Horizontal row, vertically centered */}
<div className="grid grid-cols-2 gap-2">           {/* Two-column grid */}

// Spacing
<div className="px-4 py-2">                       {/* Horizontal + vertical padding */}
<div className="mb-4">                             {/* Bottom margin */}

// Sizing
<div className="w-full">                           {/* Full width */}
<div className="h-full overflow-y-auto">           {/* Full height, scrollable */}

// Text
<span className="text-sm text-muted-foreground">  {/* Small, gray text */}
<span className="font-bold">                      {/* Bold text */}
```

## App Shell Pattern

The standard plugin UI pattern:

```tsx
import { useState } from "react";
import { Button, Input, SectionTitle, Type } from "@repo/ui";
import { PLUGIN_CHANNEL } from "./app.network";
import { PLUGIN } from "@repo/common/networkSides";

function App() {
  const [result, setResult] = useState<string | null>(null);

  async function handleAction() {
    try {
      const data = await PLUGIN_CHANNEL.request(PLUGIN, "myAction", []);
      setResult(data);
    } catch (err) {
      setResult(`Error: ${(err as Error).message}`);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4 h-full">
      <SectionTitle>My Plugin</SectionTitle>
      <Button onClick={handleAction}>Run</Button>
      {result && <Type size="small">{result}</Type>}
    </div>
  );
}

export default App;
```

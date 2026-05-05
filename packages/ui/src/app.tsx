import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertDescription,
  Button,
  Checkbox,
  Icon,
  IconButton,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  SectionTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  Type,
} from "./index";

function App() {
  return (
    <div className="overflow-y-auto h-full px-4 py-2">
      <div className="flex flex-col gap-2 mb-6">
        <SectionTitle>Inputs</SectionTitle>
        <Input placeholder="Type something" />
        <Textarea placeholder="Longer text..." rows={3} />
        <div className="flex items-center gap-2">
          <Checkbox id="cb1" defaultChecked />
          <Label htmlFor="cb1">Option A</Label>
        </div>
        <RadioGroup defaultValue="a">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="a" id="r1" />
            <Label htmlFor="r1">Option A</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="b" id="r2" />
            <Label htmlFor="r2">Option B</Label>
          </div>
        </RadioGroup>
        <div className="flex items-center gap-2">
          <Switch id="sw1" defaultChecked />
          <Label htmlFor="sw1">Enable feature</Label>
        </div>
        <Select defaultValue="a">
          <SelectTrigger>
            <SelectValue placeholder="Choose..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="a">Option A</SelectItem>
            <SelectItem value="b">Option B</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2 mb-6">
        <SectionTitle>Buttons</SectionTitle>
        <Button variant="default">Primary action</Button>
        <Button variant="secondary">Secondary action</Button>
        <IconButton iconProps={{ name: "lucide:plus" }} aria-label="Add item" />
      </div>

      <div className="flex flex-col gap-2 mb-6">
        <SectionTitle>Display</SectionTitle>
        <Icon name="lucide:star" />
        <Label>Field label</Label>
        <Type size="large" weight="bold">
          Heading text
        </Type>
        <Alert>
          <Icon name="lucide:info" className="size-4" />
          <AlertDescription>This is a tip for new users.</AlertDescription>
        </Alert>
      </div>

      <div className="flex flex-col gap-2 mb-6">
        <SectionTitle>Layout</SectionTitle>
        <Accordion type="single" collapsible defaultValue="item-1">
          <AccordionItem value="item-1">
            <AccordionTrigger>More info</AccordionTrigger>
            <AccordionContent>Details here.</AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}

export default App;

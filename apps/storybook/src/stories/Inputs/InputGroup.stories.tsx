import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@repo/ui";
import type { Meta, StoryObj } from "@storybook/react";
import { SearchIcon } from "lucide-react";

const meta = {
  component: InputGroup,
  title: "Inputs/InputGroup",
  tags: ["autodocs"],
} satisfies Meta<typeof InputGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <InputGroup>
      <InputGroupAddon>
        <InputGroupText>
          <SearchIcon />
        </InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="Search..." />
    </InputGroup>
  ),
};

export const WithAddonEnd: Story = {
  render: () => (
    <InputGroup>
      <InputGroupInput placeholder="Amount" />
      <InputGroupAddon align="inline-end">
        <InputGroupText>USD</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  ),
};

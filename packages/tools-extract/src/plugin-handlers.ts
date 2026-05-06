import type { PluginHandler } from "@repo/protocol";
import type { ExtractComponents, ExtractLocalVariables, ExtractStyles } from "./tools";

const summarizeStyle = (s: { id: string; name: string; description?: string }) => ({
  id: s.id,
  name: s.name,
  description: s.description,
});

export const extractStylesPluginHandler: PluginHandler<typeof ExtractStyles> = async (
  _args,
  { figma }
) => {
  const [paint, text, effect] = await Promise.all([
    figma.getLocalPaintStylesAsync(),
    figma.getLocalTextStylesAsync(),
    figma.getLocalEffectStylesAsync(),
  ]);
  return {
    paintStyles: paint.map(summarizeStyle),
    textStyles: text.map(summarizeStyle),
    effectStyles: effect.map(summarizeStyle),
  };
};

export const extractComponentsPluginHandler: PluginHandler<typeof ExtractComponents> = async (
  _args,
  { figma }
) => {
  const components = await figma.getLocalComponentsAsync();
  return {
    components: components.map((c) => ({
      id: c.id,
      name: c.name,
      key: c.key,
      description: c.description,
    })),
  };
};

export const extractLocalVariablesPluginHandler: PluginHandler<
  typeof ExtractLocalVariables
> = async (_args, { figma }) => {
  const variables = await figma.getLocalVariablesAsync();
  return {
    variables: variables.map((v) => ({
      id: v.id,
      name: v.name,
      resolvedType: v.resolvedType,
      valuesByMode: { ...v.valuesByMode },
    })),
  };
};

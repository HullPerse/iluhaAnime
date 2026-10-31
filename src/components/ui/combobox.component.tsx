import type { ComboboxProps } from "@/types/core/ui";

import Select from "@/components/ui/select.component";

export default function Combobox<T extends string = string>(props: ComboboxProps<T>) {
  return <Select {...props} searchable />;
}

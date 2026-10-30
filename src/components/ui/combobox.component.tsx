import type { ComboboxProps } from "@/types/core/ui";

import Select from "@/components/ui/select.component";

export default function Combobox(props: ComboboxProps) {
  return <Select {...props} searchable />;
}

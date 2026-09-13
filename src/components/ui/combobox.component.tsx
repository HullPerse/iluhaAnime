import type { ComboboxProps } from "@/types/ui";

import Select from "./select.component";

export default function Combobox(props: ComboboxProps) {
  return <Select {...props} searchable />;
}

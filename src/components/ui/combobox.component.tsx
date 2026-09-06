import Select from "./select.component";

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly {
    value: string;
    label: string;
    style?: React.CSSProperties;
  }[];
  className?: string;
  placeholder?: string;
  arrow?: boolean;
  disabled?: boolean;
  indexed?: boolean;
}

export default function Combobox(props: ComboboxProps) {
  return <Select {...props} searchable />;
}

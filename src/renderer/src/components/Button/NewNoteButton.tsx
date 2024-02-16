import { ActionButton, ActionButtonProps } from "./ActionButton";
import { LuFileSignature } from "react-icons/lu";

export const NewNoteButton = ({ ...props }: ActionButtonProps) => {
	return (
		<ActionButton {...props}>
			<LuFileSignature className="w-4 h-4 text-zinc-300" />
		</ActionButton>
	);
};

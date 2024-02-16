import { ActionButton, ActionButtonProps } from "@/components";
import { FaTrashCan } from "react-icons/fa6";

export const DeleteNoteButton = ({ ...props }: ActionButtonProps) => {
	return (
		<ActionButton>
			<FaTrashCan className="w-4 h-4 text-zinc-300" />
		</ActionButton>
	);
};

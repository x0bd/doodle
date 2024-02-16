import { DeleteNoteButton, NewNoteButton } from "@/components";
import { Component, ComponentProps } from "react";

export const ActionButtonsRow = ({ ...props }: ComponentProps<"div">) => {
	return (
		<div {...props}>
			<NewNoteButton />
			<DeleteNoteButton />
		</div>
	);
};

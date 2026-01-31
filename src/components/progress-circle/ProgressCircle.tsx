import { FC } from "react";
import { CircularProgressbar } from "react-circular-progressbar";
import "./ProgressCircle.css";

interface ProgressCircleProps {
	percentage: number;
	readingProgress?: number;
	showText?: boolean;
	customText?: string;
	showPercentageSymbol?: boolean;
}

export const ProgressCircle: FC<ProgressCircleProps> = ({
	percentage,
	readingProgress,
	showText = true,
	customText,
	showPercentageSymbol = true,
}) => {
	const roundedPercentage = Math.round(percentage);

	const getDisplayText = () => {
		if (customText) return customText;
		if (!showText) return "";
		return showPercentageSymbol
			? `${roundedPercentage}%`
			: `${roundedPercentage}`;
	};

	const displayText = getDisplayText();

	return (
		<div className="NToc__progress-circle-wrapper">
			{/* Saved Reading Progress Layer (Background) */}
			{readingProgress !== undefined && (
				<div className="NToc__progress-circle-layer NToc__progress-circle-reading">
					<CircularProgressbar
						value={readingProgress}
						strokeWidth={20}
						styles={{
							root: {},
							path: {
								stroke: "#0df",
								strokeLinecap: "inherit",
								transition: "stroke-dashoffset 0.5s ease 0s",
							},
							trail: {
								stroke: "var(--background-modifier-border)",
							},
							text: {
								fill: "var(--text-normal)",
								fontSize: "1.5rem",
								dominantBaseline: "middle",
								textAnchor: "middle",
							},
						}}
					/>
				</div>
			)}

			{/* Current Scroll Progress Layer (Foreground) */}
			<div className="NToc__progress-circle-layer NToc__progress-circle-current">
				<CircularProgressbar
					value={percentage}
					text={displayText}
					strokeWidth={10}
					styles={{
						root: {},
						path: {
							stroke: "var(--interactive-accent)",
							strokeLinecap: "inherit",
							transition: "stroke-dashoffset 0.5s ease 0s",
						},
						trail: {
							stroke: "var(--background-modifier-border)",
						},
						text: {
							fill: "var(--text-normal)",
							fontSize: "1.5rem",
							dominantBaseline: "middle",
							textAnchor: "middle",
						},
					}}
				/>
			</div>
		</div>
	);
};

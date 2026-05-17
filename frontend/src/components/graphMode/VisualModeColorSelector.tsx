import React, { useState } from "react";
import Slider from "./Slider";

type Props = {
    color: string;
    setColor: any;
    value: number;
    setValue: any;
    isDarkMode: boolean;
};
const ColorSelector: React.FC<Props> = ({
    color,
    setColor,
    value,
    setValue,
    isDarkMode,
}) => {
    const [open, setOpen] = useState(false);
    const [buttonText, setButtonText] = useState("Color By");
    const [max, setMax] = useState(100);
    const [min, setMin] = useState(0);
    const [showSlider, setShowSlider] = useState(false);

    const handleClick = (e: any) => {
        setOpen(!open);
    };

    const handleSelectMode = (e: any) => {
        setOpen(!open);
        color = e.currentTarget.value;
        setColor(e.currentTarget.value);
        if (e.currentTarget.value === "latency") {
            setShowSlider(true);
            setMin(0);
            setMax(2000);
            setValue(500);
        } else if (
            e.currentTarget.value === "dark-default" ||
            e.currentTarget.value === "light-default"
        ) {
            setShowSlider(false);
        } else {
            setShowSlider(true);
            setMin(0);
            setMax(100);
            setValue(50);
        }
    };

    return (
        <div className="absolute top-80 left-4 z-50 flex flex-col gap-2 text-sm bg-blue-300 bg-opacity-60 rounded-lg p-4 w-1/6">
            <div>
                <button
                    type="button"
                    className="inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-100"
                    id="menu-button"
                    aria-expanded="true"
                    aria-haspopup="true"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleClick(e);
                    }}
                    onTouchEnd={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleClick(e);
                    }}
                >
                    {buttonText}
                    <svg
                        className="-mr-1 ml-2 h-5 w-5"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                    >
                        <path
                            fillRule="evenodd"
                            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                            clipRule="evenodd"
                        />
                    </svg>
                </button>
            </div>
            {open ? (
                <div
                    id="dropdown-states"
                    className="z-10 bg-white divide-y divide-gray-100 rounded-lg shadow w-full "
                >
                    <ul
                        className="py-2 text-sm text-gray-700 "
                        aria-labelledby="states-button"
                    >
                        <li>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectMode(e);
                                }}
                                onTouchEnd={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleSelectMode(e);
                                }}
                                value={"neighbor"}
                                className="inline-flex w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 "
                            >
                                <div className="inline-flex items-center">
                                    Neighbor Unique
                                </div>
                            </button>
                        </li>
                        <li>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectMode(e);
                                }}
                                onTouchEnd={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleSelectMode(e);
                                }}
                                value={
                                    isDarkMode
                                        ? "dark-default"
                                        : "light-default"
                                }
                                className="inline-flex w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 "
                            >
                                <div className="inline-flex items-center">
                                    None
                                </div>
                            </button>
                        </li>
                    </ul>
                </div>
            ) : (
                <></>
            )}
            {/*showSlider ? (
                <Slider
                    max={max}
                    setMax={setMax}
                    min={min}
                    setMin={setMin}
                    value={value}
                    setValue={setValue}
                />
            ) : (
                <></>
            )*/}
        </div>
    );
};

export default ColorSelector;

## About

This is the frontend react application for the microservice visualization platform.

The code visualizes a system of microservices as nodes (the microservices) and links (the method calls between them). It also provides the capability to filter microservices to see at the component level how they interact (controllers, entities, repositories, etc). Clicking on a link or a node in either view will bring up information about the link or node. There is also an option to track changes between commits where the red links/nodes are deleted from the previous commit, the green links/nodes are added from the previous commit, and the yellow links are modified from the previous commit. Clicking on a modified link will highlight the removed/added/unchanged method calls in the pop up box. Antipatterns can also be displayed as well.

The data is gotten from an input file located at `/frontend/src/data/input.json`. This contains a json object that is a list of the paths to the IR files to read, in the order that they should be in (found at https://zenodo.org/records/13922262 - download the whole zip and use IR files from OutputValidation\train-ticket\IR). **For this to work, the IR files have to be placed in the `/frontend/public/data` directory.**

## Setup

Navigate to this directory in your code editor:
`cd frontend`

Install all related dependencies using `npm install`. You will have to do this any time these change.

To run the app in development mode: `npm start`.
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

## Development
### App.tsx
This is the main file where all the components of the website are created. Lines 59-90 (the useEffect() block) are where the data is initialized. The first section, the fetchData function, is where the data files are read in. The input file listing the file paths of IR files to use, `/frontend/src/data/input.json`, is read and the file paths are used to open the data files in the order that the file paths are listed in input.json. **For this to work, the IR files have to be placed in the `/frontend/public/data` directory.** (This needs to happen so that the files can be mounted into the frontend and fetched - cannot open a file using fs from a frontent context). Then lines 81-89 are where the graphData and graphTimeline are set - graphData is the current instance of the graph being displayed (needs to contain the nodes and links list), and graphTimeline is the timeline of the commits (in the format of an IR file).

### getData.js
The data is converted from the IR file format to a JSON object with links and nodes using the getData() function from `src/getData.js`. This function iterates through the IR file and parses it. The first parameter is the JSON object from an IR file, and the second parameter is the nodes_array - this is used when filtering nodes using the box on the left side of the screen. If you're calling it and not filtering nodes, pass undefined as the second parameter. 

### getChanges.js
The data can also be converted from an IR file format to a JSON object with links and nodes attributes using compareChanges() from `src/getChanges.js`. This function, compareChanges(), takes two commits, and gets the changes from the first one to the second one. The output of this will contain information in the same format as getData except each link and node will have a color attribute used to color them for displaying changes. This will also include more information that getData() - the links and nodes that were deleted from the previous commit are also included.

### page.js
This is for the FilterBox on the left side of the screen that filters nodes. The FilterBox, when called in App.tsx, has a key parameter that is made up of currentInstance (int) trackChanges (boolean) - this is used to rerender the whole component any time either one of these variables changes (when the user changes which commit is being viewed or toggles trackChanges on/off, that uses different data and we want to update the list of nodes accordingly). 

### TimeSlider.tsx
This is used for the commit slider at the bottom of the screen that can be used to change which commit is being viewed (which IR file the data is from). The order of the file paths in input.json is the order the commits will be in, so ensure that order is correct. The handleChange method lines 25-40 is where the data is changed - currentInstance is the index of the graphTimeline array (set in App.tsx) that the data should be from. Then, we check if trackChanges is true and set the graphData accordingly (if true, set it to result of compareChanges(prevCommit, currentCommit), and if not, set it to result of getData(currentCommit) (currentCommit is graphTimeline[e.target.value])). 

### node.js
Sandeep

### createConnections.js
Sandeep

### GraphFunctions.tsx
This file contains the functionality to set the colors of links and nodes - getColor() is the function for node colors, and getLinkColor() is the function for link colors. We put the functionality for the trackChanges colors after the highlighting colors (like when you hover over a node), so that if you're highlighting something it will still appear. 

### GraphMenu.tsx
This file is where the toggle for tracking changes was added (lines 90-115), and when trackChanges is changed, it sets graphData to be either showing changes (compareChanges)(trackChanges now true) or not showing changes (getData) (trackChanges is now false).

### index.tsx
Does include intial graphData that is set to null - want to refresh in App.tsx when the input file can be read.
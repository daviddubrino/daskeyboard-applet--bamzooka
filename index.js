
const q = require('daskeyboard-applet');
const request = require('request-promise');

// bamzooka base api url
const apiBaseUrl = `http://localhost:3000/api/v1`;
const clientBaseUrl = `http://localhost:4200`;
const logger = q.logger;

class BamzookaAssignment {
  constructor(assignment) {
    this.due_at = assignment.due_at;
  }
}

class BamzookaAssignmentsGroup {
  constructor(assignments) {
    this.assignments = assignments.map(a => new BamzookaAssignment(a));
    this.lateDue = 0;
    this.dueSoon = 0;
    this.total = 0;
    this.processAssignmentsCounters();

  }

  /**
   * Counts the nunber of due soon and late 
   */
  processAssignmentsCounters() {
    this.total = this.assignments.length;
    this.assignments.forEach(a => {
      if (a.due_at) {
        const now = new Date(Date.now());
        const assignmentDueDate = new Date(a.due_at);
        const dueDateMinus2Days = new Date();
        dueDateMinus2Days.setDate(assignmentDueDate.getDate() - 2);
        // 2 days before the due date
        if (now.getTime() >= dueDateMinus2Days.getTime() && now.getTime() <= assignmentDueDate.getTime()) {
          this.dueSoon++;
        } else {
          if (assignmentDueDate.getTime() < now.getTime()) {
            // past the due date
            this.lateDue++;
          }
        }
      }
    });
  }

  /**
   * Returns a signal depending on the list of the assignments.
   * More on the method comments
   * @param {} workspaceId the workspaceId configured by the user
   */
  getSignal(workspaceId) {
    // If no assignments no signal sent
    if (this.total === 0) {
      return null;
    }
    // TODO add url
    const linkParams = {
      url: `${clientBaseUrl}/workspaces/${workspaceId}/inbox?is_open=true&sortField=due_at&sortOrder=asc&due_at_nil_order_position=last&page=1&per_page=20`,
      label: `Open in Bamzooka!`
    };
    // at least one late blink red
    if (this.lateDue >= 1) {
      return new q.Signal({
        points: [
          [new q.Point('#FF0000', q.Effects.BLINK)]
        ],
        name: 'Bamzooka!',
        message: `You have ${this.lateDue} late due ${this.lateDue > 1 ? 'assignment' : 'assignments'}.`,
        link: linkParams
      });
    }
    // at least 1 is due soon set color orange
    if (this.dueSoon >= 1) {
      return new q.Signal({
        points: [
          [new q.Point('#FFA500', q.Effects.SET_COLOR)]
        ],
        name: 'Bamzooka!',
        message: `You have ${this.dueSoon} ${this.dueSoon > 1 ? 'assignment' : 'assignments'} due soon.`,
        link: linkParams
      });
    }

    // Assignments but nothing urgent -> return blue set color
    return new q.Signal({
      points: [
        [new q.Point('#0000FF', q.Effects.SET_COLOR)]
      ],
      name: 'Bamzooka!',
      message: `You have ${this.total} ${this.total > 1 ? 'assignment' : 'assignments'}.`,
      link: linkParams
    });
  }

}

/**
 * Returns the workspaces I have access too given my API key
 */
async function getWorkspacesIHaveAccessTo(apiKey) {
  const requestOptions = {
    uri: apiBaseUrl + `/workspaces/all_my_accesses`,
    headers: {
      'X-API-KEY': apiKey
    },
    json: true
  };

  return request(requestOptions).then(result => {
    logger.info(`Bamzooka fetched ${result.length} workspaces`);
    return result;
  });
};

// Main class app that extends the q.DesktopApp from the daskeyboard-applet module
class QBamzooka extends q.DesktopApp {
  constructor() {
    super();
    // overwrite default polling interval to 10 minutes
    this.pollingInterval = 1000 * 60 * 10; // every 10 minutes
  }

  /** 
   * The run function that will be called each pollingInterval.
   */
  async run() {
    logger.info('QBamzooka running...');
    return this.getAssignments().then(assignmentsGroup => {
      logger.info(`got ${assignmentsGroup.total} assignments from Bamzooka`);
      const workspaceId = this.config.workspaceId;
      return assignmentsGroup.getSignal(workspaceId);
    }).catch(error => {
      const errMessage = `Error when running: ${error}`
      logger.error(errMessage);
      return q.Signal.error([`${errMessage}`]);
    });
  }

  /**
   * Get First Page of Assignemnts ordered by due at asc and put nil due_at at the end
   * ensure:
   * - a Bamzooka asssignments group
   */
  async getAssignments() {
    logger.info(`Getting assignments`);
    // TODO
    // Take workspace ID from user config
    const workspaceId = this.config.workspaceId;
    // TODO handle project ID
    // const projectId = this.config.workspaceId === '';
    const requestOptions = {
      uri: apiBaseUrl + `/workspaces/${workspaceId}/assignments/my_assignments`,
      headers: {
        'X-API-KEY': this.authorization.apiKey
      },
      qs: {
        order_by: `due_at asc`,
        due_at_nil_order_position: `last`,
        is_open: true
      },
      json: true
    };

    return request(requestOptions).then(result => {
      return new BamzookaAssignmentsGroup(result);
    });
  }

  /**
   * Called from the Das Keyboard Q software to retrieve the options to display for
   * the user inputs
   * @param {} fieldId 
   * @param {*} search 
   */
  async options(fieldId, search) {
    // Looking for options for workspaces
    if (fieldId === 'workspaceId') {
      if (this.authorization.apiKey) {
        return getWorkspacesIHaveAccessTo(this.authorization.apiKey).then(workspaces => {
          return workspaces.map(workspace => {
            return {
              key: workspace.id,
              value: workspace.name
            };
          });
        }).catch(error => {
          logger.error(`Error when loading workspaces ${error}`);
          return [{
            key: null,
            value: `Could not get workspaces. Are you sure your API key is valid?`
          }]
        });
      }
    }
  }
}



module.exports = {
  QBamzooka: QBamzooka,
  BamzookaAssignmentsGroup: BamzookaAssignmentsGroup
}

const applet = new QBamzooka();
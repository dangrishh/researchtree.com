import { useEffect, useState } from "react";
import React from "react";
import {
  List,
  Typography,
  Button,
  message,
  Modal,
  Input,
  Checkbox,
  ConfigProvider,
  Select,
  Progress,
  Space,
  Tag
} from "antd";
import {
  EditOutlined,
  CheckOutlined,
  FileDoneOutlined,
  DeleteOutlined,  
  PlusOutlined,
  BookOutlined,
  StarOutlined
} from "@ant-design/icons";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@mui/material";

import CkEditorDocuments from "./CkEditorDocuments";
import GradingAdvicer from "./ViewGrading";

import axios from "axios";
import { bgcolor, maxWidth } from "@mui/system";

const { Text } = Typography;
const { Option } = Select;

export default function NewTables() {
  const [acceptedStudents, setAcceptedStudents] = useState([]);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [selectedChannelId, setSelectedChannelId] = useState(null);

  const [gradingModalOpen, setGradingModalOpen] = useState(false);
  const [gradingStudentId, setGradingStudentId] = useState(null);

  const [courses, setCourses] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState("");

  // Modal states
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [currentTaskStudent, setCurrentTaskStudent] = useState(null);
  const [taskInput, setTaskInput] = useState("");
  const [tasks, setTasks] = useState([]);
  const [isGradeModalVisible, setIsGradeModalVisible] = useState(false); // State for grade modal

  const [progress, setProgress] = useState(0);

  const user = JSON.parse(localStorage.getItem("user"));

  useEffect(() => {
    // Fetch students
    const fetchStudents = async () => {
      try {
        const response = await fetch(
          `http://localhost:7000/api/advicer/advisor-students/${user._id}`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );
        if (response.ok) {
          const data = await response.json();
          setAcceptedStudents(data.acceptedStudents);
          setFilteredStudents(data.acceptedStudents);

          // Extract unique courses from the students data
          const uniqueCourses = [
            ...new Set(data.acceptedStudents.map((student) => student.course)),
          ];
          setCourses(uniqueCourses);
        } else {
          const errorData = await response.json();
          console.error("Error fetching students:", errorData.message);
        }
      } catch (error) {
        console.error("Error fetching students:", error.message);
      }
    };

    fetchStudents();
  }, [user._id]);

  const resetVotes = async (userId) => {
    try {
      const response = await axios.post(
        `http://localhost:7000/api/advicer/reset-manuscript-status/${userId}`  // Corrected URL
      );
  
      const { message: successMessage } = response.data;
      message.success(successMessage);
  
    } catch (error) {
      if (error.response) {
        console.error("Error response:", error.response.data);
        message.error(
          `Error: ${error.response.data.message || "Failed to reset votes"}`
        );
      } else {
        console.error("Error:", error.message);
        message.error("Error resetting votes");
      }
    }
  };

  const handleViewManuscript = (studentId, channelId) => {
    setSelectedStudentId(studentId);
    setSelectedChannelId(channelId);
    setIsEditorOpen(true);
  };

  const closeEditorModal = () => {
    setIsEditorOpen(false); // Close modal
    setSelectedStudentId(null);
    setSelectedChannelId(null);
  };

  const handleViewGrade = (studentId) => {
    setGradingModalOpen(true);
    setGradingStudentId(studentId);
  };
  const closeGradingModal = () => {
    setGradingModalOpen(false); // Close modal
    setGradingStudentId(null);
  };

  const addTask = async (studentId, taskTitle) => {
    try {
      const response = await fetch(
        `http://localhost:7000/api/advicer/add-task/${studentId}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ taskTitle }),
        }
      );
      if (response.ok) {
        setTasks((prevTasks) => [
          ...prevTasks,
          { title: taskTitle, completed: false },
        ]);
        setTaskInput(""); // Clear the input field
        fetchTasks(studentId); // Fetch tasks again to immediately update the task list in the modal
      }
    } catch (error) {
      console.error("Error adding task:", error);
    }
  };

  const deleteTask = async (studentId, taskId) => {
    try {
      const response = await fetch(
        `http://localhost:7000/api/advicer/delete-task/${studentId}/${taskId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );

      if (response.ok) {
        message.success("Task deleted successfully");
        setTasks((prevTasks) =>
          prevTasks.filter((task) => task._id !== taskId)
        ); // Remove task from state
      } else {
        const errorData = await response.json();
        console.error("Error deleting task:", errorData.message);
        message.error(`Error: ${errorData.message || "Failed to delete task"}`);
      }
    } catch (error) {
      console.error("Error deleting task:", error.message);
      message.error("Error deleting task");
    }
  };

  const fetchTasks = async (studentId) => {
    try {
      const response = await fetch(
        `http://localhost:7000/api/advicer/tasks/${studentId}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks);
      } else {
        const errorData = await response.json();
        console.error("Error fetching tasks:", errorData.message);
      }
    } catch (error) {
      console.error("Error fetching tasks:", error.message);
    }
  };

  const fetchTaskProgress = async (studentId) => {
    if (!studentId) {
      console.log("No selectedStudentId found."); // Debug statement
      return;
    }
    try {
      const response = await fetch(
        `http://localhost:7000/api/advicer/tasks/progress/${studentId}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );

      if (response.ok) {
        const { progress: studentProgress } = await response.json();
        console.log("Received progress:", studentProgress); // Debug statement
        setProgress((prevProgress) => ({
          ...prevProgress,
          [studentId]:
            studentProgress >= 0 && studentProgress <= 100
              ? studentProgress
              : 0,
        }));
      } else {
        console.error("Error fetching progress.");
      }
    } catch (error) {
      console.error("Error fetching task progress:", error);
    }
  };

  useEffect(() => {
    filteredStudents.forEach((student) => {
      fetchTaskProgress(student._id);
    });
  }, [filteredStudents]);

  const updateManuscriptStatus = async (channelId, newStatus) => {
    Modal.confirm({
      title: 'Are you sure you want to update manuscript?',
      onOk: async () => {
    try {
      const response = await axios.patch(
        "http://localhost:7000/api/advicer/thesis/manuscript-status",
        { channelId, manuscriptStatus: newStatus } // Send student ID and new status
      );

      message.success("Manuscript Updated for Ready to Defense!");
    } catch (error) {
      if (error.response) {
        console.error("Error response:", error.response.data);
        message.error(
          `Error: ${error.response.data.message || "Failed to update status"}`
        );
      } else {
        console.error("Error:", error.message);
        message.error("Error updating status");
      }
    }
  },
});
};

  const updatePanelManuscriptStatus = async (channelId, newStatus, userId) => {
    try {
      const response = await axios.patch(
        "http://localhost:7000/api/advicer/thesis/panel/manuscript-status",
        { channelId, manuscriptStatus: newStatus, userId }
      );

      const { remainingVotes, message: successMessage } = response.data;

      message.success(successMessage);

      // Display remaining votes if status is `Approved on Panel` or `Revise on Panelist` and there are pending votes
      if (
        (newStatus === "Revise on Panelist" || newStatus === "Approved on Panel") &&
        remainingVotes > 0
      ) {
        message.info(
          `Only ${remainingVotes} more vote(s) needed to proceed with the manuscript`
        );
      }
    } catch (error) {
      if (error.response) {
        console.error("Error response:", error.response.data);
        message.error(
          `Error: ${error.response.data.message || "Failed to update status"}`
        );
      } else {
        console.error("Error:", error.message);
        message.error("Error updating status");
      }
    }
  };

  const openTaskModal = (student) => {
    setCurrentTaskStudent(student);
    setIsModalVisible(true);
    fetchTasks(student._id); // Fetch tasks when opening modal
  };

  const handleTaskInputChange = (e) => {
    setTaskInput(e.target.value);
  };

  const handleAddTask = () => {
    if (currentTaskStudent && currentTaskStudent._id) {
      addTask(currentTaskStudent._id, taskInput); // Pass actual student ID
    } else {
      console.error("Student ID is not set.");
    }
  };

  const handleCompleteTask = (index) => {
    const updatedTasks = tasks.map((task, i) => {
      if (i === index) {
        return { ...task, completed: !task.completed };
      }
      return task;
    });
    setTasks(updatedTasks); // Update task completion status
  };

  // Handle course selection
  const handleCourseChange = (value) => {
    setSelectedCourse(value);
    if (value === "") {
      setFilteredStudents(acceptedStudents); // Show all students if no course is selected
    } else {
      setFilteredStudents(
        acceptedStudents.filter((student) => student.course === value)
      );
    }
  };

  const openGradeModal = () => {
    setIsGradeModalVisible(true);
  };

  const closeGradeModal = () => {
    setIsGradeModalVisible(false);
  };

  return (
    <div
      style={{ flex: 1, overflowX: "hidden", padding: "20px", width: "1263px", marginTop: '-90px' }}
    >
      {/* Dropdown for course filtering */}
      <Select
        value={selectedCourse}
        onChange={handleCourseChange}
        style={{ marginBottom: "20px", width: "200px", marginLeft: '1000px' }}
        placeholder='Select a course'
      >
        <Option value=''>All Courses</Option>
        {courses.map((course) => (
          <Option key={course} value={course}>
            {course}
          </Option>
        ))}
      </Select>

      <List
        grid={{ gutter: 16, column: 1 }}
        dataSource={filteredStudents.filter(
          (student) =>
            student.manuscriptStatus === "Revise on Panelist" ||
            student.manuscriptStatus === "Approved on Panel"
        )}
        renderItem={(student) => (
          <List.Item key={student._id}>
            <div
              style={{
                height: "auto", padding: "30px",
                borderRadius: "8px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: "#2B2B2B",
                marginBottom: "16px",
              }}
            >
              <div style={{ flex: 1,   maxWidth: '890px',}}>
              <Tag
                  icon={<StarOutlined />}
                  color={
                    student.manuscriptStatus === "Revise on Panelist"
                      ? "#faad14"
                      : student.manuscriptStatus === "Approved on Panel"
                      ? "#1E1E"
                      : "#1E90FF" // Default color
                  }
                  style={{
                    padding: "2px",
                    
                    color: "white",
                
                    fontSize: "15px",
                  }}
                >
                  {student.manuscriptStatus || "N/A"}
                </Tag>
                <br />
                <Text
                  style={{
                    color: "#ffffff",
                    fontSize: "22px",
                    fontWeight: "bold",
                   
                  }}
                >
                  {student.proposalTitle}
                </Text>
                <br />
                <Text style={{ color: "gray" }}>
                  <span className='font-bold'>Authors: </span>
                  {student.groupMembers
                    .map((member) => member.replace(/([a-z])([A-Z])/g, "$1 $2")) // Insert space between lowercase and uppercase letters
                    .join(", ")}
                </Text>
                <br />
                <Text style={{ color: "gray" }}>
                  <span className='font-bold'>Panelists: </span>
                  {student.panelists.join(", ")}
                </Text>
                <br />
                {student.submittedAt && (
                  <Text style={{ color: "gray", marginRight: "10px" }}>
                    <span className='font-bold'>Date Uploaded:</span>{" "}
                    {new Date(student.submittedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Text>
                )}
              

                <br />
                 <p style={{ color: "#ffffff", marginTop: '10px'}}><span className='font-bold'>Course : </span>{student.course}</p>
                <p style={{ color: "#ffffff" }}><span className='font-bold'>Leader :</span> {student.name}</p>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  marginRight: "10px",
                }}
              >
                <Progress
                  type='dashboard'
                  steps={8}
                  percent={progress[student._id] || 0} // Use 0 if no progress is available for this student
                  trailColor='rgba(0, 0, 0, 0.06)'
                  strokeWidth={20}
                  style={{
                    width: "50px",
                    height: "50px",
                    marginLeft: "-350px",
                    marginTop: "-5px",
                    position: "absolute",
                  }}
                  format={(percent) => (
                    <span style={{ color: "white", fontSize: "20px" }}>{percent}%</span>
                  )}
                  
                />

                {student.manuscriptStatus === "Revise on Panelist" ? (
                  <>
                    <Button
                     
                      onClick={() =>
                        handleViewManuscript(student._id, student.channelId)
                      }
                      style={{ marginBottom: "10px", width: "105px" }}
                    >
                     <img className="mr-[-4px]" src="/src/assets/view-docs.png" />
                      Document
                    </Button>

                    <Button
                      onClick={() => openTaskModal(student)}
                      style={{ marginBottom: "10px", width: "105px" }}
                    >
                      <img className="mr-[-4px]" src="/src/assets/addtask.png" />
                      Add Task
                    </Button>

                    {/* <Button
                      
                      onClick={() =>
                        updatePanelManuscriptStatus(
                          student._id,
                          "Approved on Panel",
                          user._id
                        )
                      }
                      style={{ marginBottom: "10px", width: "105px" }}
                    > 
                      <img className="mr-[-4px]" src="/src/assets/grade.png" />
                    View Grade
                    </Button> */}
                    
                    <Button
                      onClick={() => resetVotes(student._id)}
                      style={{marginBottom: '10px', width: "105px" }}
                    >
                      <img className="mr-[-4px]" src="/src/assets/approved.png" /> 
                      Done
                    </Button>

                   

                  </>
                ) : (
                  <>

                <Button
                  
                  onClick={() =>
                    handleViewManuscript(student._id, student.channelId)
                  }
                  style={{ marginBottom: "10px", width: "105px" }}
                >
                 <img className="mr-[-4px]" src="/src/assets/view-docs.png" /> 
                 Document
                </Button>
                
                    <Button
                      
                      onClick={() => openTaskModal(student)}
                      style={{ marginBottom: "10px", width: "105px" }}
                    >
                       <img className="mr-[-4px]" src="/src/assets/addtask.png" />
                      View Task
                    </Button>

                    <Button
                      onClick={() => handleViewGrade(student._id)}
                      style={{ marginBottom: "10px", width: "105px" }}
                    >
                    <img className="mr-[-4px]" src="/src/assets/grade.png" />
                      View Grade
                    </Button>

                    {/* <Button
                      onClick={() => resetVotes(student._id)}
                      style={{marginBottom: '10px', width: "105px" }}
                    >
                      <img className="mr-[-4px]" src="/src/assets/revise.png" /> 
                      Reset 
                    </Button> */}
                  </>
                )}
              </div>
            </div>
          </List.Item>
        )}
      />
      {/* 
      {isEditorOpen && selectedStudentId && (
        <CkEditorDocuments
          userId={user._id}
          channelId={selectedChannelId}
          onClose={() => setIsEditorOpen(false)}
        />
      )} */}

      <Modal
        visible={isGradeModalVisible}
        onCancel={closeGradeModal}
        footer={null}
      >
        <h2>Grade Rubric</h2>
        <p>Rubric information goes here...</p>
      </Modal>

      <ConfigProvider
        theme={{
          components: {
            Modal: {
              algorithm: true, // Enable algorithm
            },
          },
        }}
      >

          {/* Material UI Modal for Grading */}
          <Dialog
            open={gradingModalOpen}
            onClose={closeGradingModal}
            fullWidth
            maxWidth='xl'
          >
            <DialogContent sx={{ background: '#1E1E1E',height: "auto", marginTop:'-400px', marginLeft: '-350px'}}>
              {gradingStudentId && (
                <GradingAdvicer
                  panelistId={user._id}
                  studentId={gradingStudentId}
                />
              )}
            </DialogContent>
            {/* <DialogActions>
              <Button onClick={closeGradingModal} color='primary'>
                Close
              </Button>
            </DialogActions> */}
          </Dialog>
          
        {/* Material UI Modal for CKEditor */}
        <Dialog
          open={isEditorOpen}
          onClose={closeEditorModal}
          fullWidth
          maxWidth='xxl'
        >
          <DialogContent sx={{ height: "1200px" }}>
            {selectedStudentId && selectedChannelId && (
              <CkEditorDocuments
                userId={user._id}
                channelId={selectedChannelId}
              />
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={closeEditorModal} color='primary'>
              Close
            </Button>
          </DialogActions>
        </Dialog>

        <Modal
          visible={isModalVisible}
          onCancel={() => setIsModalVisible(false)}
          footer={[
            <Button key='close' onClick={() => setIsModalVisible(false)}>
              Close
            </Button>,
            <Button key='add' type='primary' onClick={handleAddTask}>
              Add Task
            </Button>,
          ]}
        >
          <Input
            placeholder='Enter a task'
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddTask();
            }}
          />
          <br />
          <br />
          <List
            dataSource={tasks}
            locale={{ emptyText: "No tasks found" }}
            renderItem={(task) => (
              <List.Item
                key={task._id}
                actions={[
                  <Text style={{ fontWeight: "bold", color: task.isCompleted ? "green" : "red" }}>
                    {task.isCompleted ? "Completed" : "Not Done"}
                  </Text>,
                  <Button
                    type='link'
                    icon={<DeleteOutlined />}
                    onClick={() => deleteTask(currentTaskStudent._id, task._id)} // Pass studentId and taskId
                  />,
                ]}
              >
                <Text delete={task.isCompleted}>{task.taskTitle}</Text>
              </List.Item>
            )}
          />
        </Modal>
      </ConfigProvider>
    </div>
  );
}
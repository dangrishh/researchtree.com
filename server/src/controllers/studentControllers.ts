import { Request, Response } from 'express';
import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import User, { IUser } from '../models/User';
import { v4 as uuidv4 } from 'uuid'; // Using UUID to generate a unique channel ID
import path from 'path';
import Rubric from "../models/Rubric";
import Grading from '../models/Grading';
import fs from 'fs';

interface IAdvisor {
  id: string;
  specializations: string[];
}

interface IStudent extends Document {
  proposals: any;
  channelId: string;
  _id: ObjectId;
  advisorStatus: string;
  chosenAdvisor: ObjectId | null;
  declinedAdvisors: ObjectId[];
  panelists: ObjectId[];
}

let NlpManager: any;

// Function to dynamically load NlpManager
const loadNlpManager = async () => {
  const nlpModule = await import('node-nlp');
  NlpManager = nlpModule.NlpManager;
};

// Load NlpManager at the start
// loadNlpManager().catch(err => console.error('Failed to load NlpManager:', err));

// Get all rubrics
export const fetchRubrics  = async (req: Request, res: Response) => {
  try {
    const rubrics = await Rubric.find();
    res.status(200).json(rubrics);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch rubrics", error });
  }
};

export const fetchFinalGrade = async (req: Request, res: Response) => {
  const { userId, rubricId } = req.params; // Get both studentId and rubricId

  try {
    // Check if the student exists
    const student = await User.findById(userId);
    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    // Ensure rubricId is in ObjectId format
    const rubricObjectId = new ObjectId(rubricId); // Convert rubricId to ObjectId type if necessary

    // Fetch grades for the student filtered by rubricId
    const grades = await Grading.find({
      studentId: userId, 
      'rubricId': rubricObjectId  // Directly query by rubricId
    })
      .populate('studentId', 'name email profileImage') // Populate student details
      .populate('panelistId', 'name email profileImage') // Populate panelist details
      .populate('rubricId', 'title criteria') // Populate rubric details
      .exec();

    // If no grades are found
    if (grades.length === 0) {
      return res.status(404).json({ message: 'No grades found for this student for the selected rubric.' });
    }

    // Organize grades by rubricId and criterion, then compute totals for each rubric
    const rubricScores: Record<string, { total: number; panelists: Set<string>; rubric: any }> = {};

    grades.forEach((grade) => {
      const rubricId = grade.rubricId._id.toString(); // Get rubric ID
      grade.grades.forEach((gradeItem) => {
        if (!rubricScores[rubricId]) {
          rubricScores[rubricId] = {
            total: 0,
            panelists: new Set(), // Using Set to track unique panelists
            rubric: grade.rubricId, // Store the rubric info for later
          };
        }

        // Add the grade value to the rubric total and track the panelist
        rubricScores[rubricId].total += gradeItem.gradeValue;
        rubricScores[rubricId].panelists.add(grade.panelistId._id.toString()); // Store panelist ID in the Set
      });
    });

    // Now compute total grade and overall grade for the rubric
    const finalRubricGrades = Object.entries(rubricScores).map(([rubricId, data]) => {
      const averageGrade = data.total / data.panelists.size; // Divide total grade by the number of unique panelists
      let overallGradeLabel = '';

      // Calculate overallGradeLabel based on average grade
      if (averageGrade >= 16 && averageGrade <= 20) {
        overallGradeLabel = 'Excellent';
      } else if (averageGrade >= 11 && averageGrade <= 15) {
        overallGradeLabel = 'Good';
      } else if (averageGrade >= 6 && averageGrade <= 10) {
        overallGradeLabel = 'Satisfactory';
      } else if (averageGrade >= 1 && averageGrade <= 5) {
        overallGradeLabel = 'Needs Improvement';
      }

      // Return the grade data for each rubric
      return {
        rubricId: data.rubric._id, // Rubric ID
        rubricTitle: data.rubric.title, // Rubric title
        totalGradeValue: averageGrade, // Total grade value (average per rubric)
        overallGradeLabel, // Overall grade label for this rubric
      };
    });

    // Format the response with rubric details and grades
    const response = {
      student: grades[0].studentId, // Details of the student
      panelists: grades.map((g) => g.panelistId), // Details of the panelists
      rubrics: finalRubricGrades, // Final grades for the rubric
    };

    // Respond with the computed final grades per rubric
    res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching final grade:', error);
    res.status(500).json({ error: 'Failed to fetch final grade.' });
  }
};


export const fetchGrades = async (req: Request, res: Response) => {
  const { userId } = req.params; // Use req.params for route parameter

  try {
    // Check if the student exists
    const student = await User.findById(userId);
    if (!student) {
      return res.status(404).json({ message: "Student not found." });
    }

    // Fetch grades for the student
    const grading = await Grading.find({ studentId: userId }) // Query using studentId
      .populate('studentId', 'name email profileImage') // Populate student details
      .populate('panelistId', 'name email profileImage') // Populate adviser details
      .populate('rubricId', 'title criteria')
      .exec();

    // If no grades are found
    if (grading.length === 0) {
      return res.status(404).json({ message: 'No grades found for this student.' });
    }

    // Compute total grades and overall grade labels
    const enrichedGrades = grading.map((grade) => {
      const totalGradeValue = grade.grades.reduce(
        (sum: number, g: { gradeValue: number }) => sum + g.gradeValue,
        0
      );

      let overallGradeLabel = '';
      if (totalGradeValue >= 16 && totalGradeValue <= 20) {
        overallGradeLabel = 'Excellent';
      } else if (totalGradeValue >= 11 && totalGradeValue <= 15) {
        overallGradeLabel = 'Good';
      } else if (totalGradeValue >= 6 && totalGradeValue <= 10) {
        overallGradeLabel = 'Satisfactory';
      } else if (totalGradeValue >= 1 && totalGradeValue <= 5) {
        overallGradeLabel = 'Needs Improvement';
      }

      return {
        ...grade.toObject(),
        totalGradeValue,
        overallGradeLabel,
      };
    });

    // Return enriched grades
    res.status(200).json(enrichedGrades);
  } catch (error) {
    console.error('Error fetching grades:', error);
    res.status(500).json({ error: 'Failed to fetch grades.' });
  }
};


const getTopAdvisors = async (): Promise<IAdvisor[]> => {
  const advisors = await User.find({ role: 'adviser', isApproved: true }).limit(5);
  return advisors.map(advisor => ({
    id: (advisor._id as unknown as string).toString(),
    specializations: advisor.specializations,
  }));
};
// Refine analyzeProposal function for better NLP matching
const analyzeProposal = async (proposalTitle: string, proposalText: string, advisors: IAdvisor[]): Promise<IAdvisor[]> => {
  if (!NlpManager) {
    throw new Error("NlpManager is not loaded yet.");
  }

  const manager = new NlpManager({ languages: ['en'], forceNER: true });

  // Adding documents based on specializations and proposal title
  advisors.forEach((advisor: IAdvisor) => {
    advisor.specializations.forEach((specialization: string) => {
      manager.addDocument('en', `I am researching ${specialization}`, advisor.id);
      manager.addDocument('en', `My research focuses on ${specialization}`, advisor.id);
      manager.addDocument('en', `I need help with ${specialization}`, advisor.id);
      manager.addDocument('en', `${specialization} is my primary research area`, advisor.id);
      // Add documents based on proposal title
      manager.addDocument('en', `My proposal title is ${proposalTitle}`, advisor.id);
    });
  });

  await manager.train();

  const response = await manager.process('en', proposalText);
  const classifiedAdvisors = response.classifications.map((classification: any) => ({
    id: classification.intent,
    score: classification.score,
  }));

  classifiedAdvisors.sort((a: any, b: any) => b.score - a.score);

  // Map classifications back to advisor objects and filter top matches
  const topAdvisors = classifiedAdvisors
    .map((classifiedAdvisor: any) => advisors.find((advisor: IAdvisor) => advisor.id === classifiedAdvisor.id))
    .filter((advisor: IAdvisor | undefined): advisor is IAdvisor => advisor !== undefined);

  return topAdvisors.slice(0, 5); // Return top 5 matching advisors
};

// Synonym Schema
interface ISynonym {
  terms: string[];  // Changed term to terms (array)
  synonyms: string[];
}

const Synonym = mongoose.model<ISynonym>('Synonym', new Schema<ISynonym>({
  terms: { type: [String], required: true },  // Now terms is an array
  synonyms: [String],
}));


// Helper function to expand entities with synonyms
async function expandEntitiesWithSynonyms(entities: string[]): Promise<string[]> {
  const expandedTerms = new Set<string>();

  // Collect all unique words from input entities
  const words = new Set<string>();
  for (const entity of entities) {
    entity.toLowerCase().split(/\s+/).forEach((word) => words.add(word)); // Split by whitespace and lowercase
  }

  // Query the database for all synonyms in one go
  const uniqueWords = Array.from(words); // Convert Set to Array for querying
  const synonymEntries = await Synonym.find({ term: { $in: uniqueWords } }); // Use 'terms' instead of 'term'

  // Build the expanded terms set
  for (const word of uniqueWords) {
    expandedTerms.add(word); // Add the original word

    // Check if the word has a synonym entry and add its synonyms
    const entry = synonymEntries.find((synonym) => synonym.terms.includes(word)); // Check 'terms' array
    if (entry) {
      entry.synonyms.forEach((synonym) => expandedTerms.add(synonym.toLowerCase()));
    }
  }

  return Array.from(expandedTerms); // Convert Set back to Array and return
}

// Proposal submission
export const createNewProposal = async (req: Request, res: Response) => {
  const { userId, proposalTitle, proposalText } = req.body;

  if (!userId || !proposalTitle || !proposalText) {
    return res.status(400).send("userId, proposalTitle, and proposalText are required.");
  }

  try {
    const student = await User.findById(userId) as IStudent | null;
    if (!student) {
      return res.status(404).send("Student not found.");
    }

    if (student.advisorStatus === "accepted") {
      return res.status(400).json({ message: 'Cannot submit proposal after advisor acceptance' });
    }
    if (student.advisorStatus === 'pending') {
      return res.status(400).json({ message: 'Cannot submit proposal, please wait for approval on advisor.' });
    }

    const channelId = uuidv4();
    student.channelId = channelId;
    await student.save();

    const newProposal = {
      proposalTitle,
      proposalText,
      submittedAt: new Date(),
    };

    student.proposals.push(newProposal);
    await student.save();

    // Expand keywords and search advisors
    const expandedQueryTerms = await expandEntitiesWithSynonyms([proposalTitle, proposalText]);
    const escapedQueryTerms = expandedQueryTerms.map(term =>
      term.replace(/[.*+?^=!:${}()|\[\]\/\\]/g, "\\$&")
    );

    const declinedAdvisors = student.declinedAdvisors || [];
    const advisors = await User.find({
      role: 'adviser',
      isApproved: true,
      specializations: { $in: escapedQueryTerms.map(term => new RegExp(term, 'i')) },
      _id: { $nin: declinedAdvisors },
    });

    if (advisors.length === 0) {
      return res.status(404).json({ status: "not found", message: "No advisors found matching specializations." });
    }

    // Filter advisors based on their availability
    const availableAdvisors = advisors.filter(advisor => {
      // Ensure handleNumber is defined before using it
      return advisor.handleNumber !== undefined && advisor.acceptedStudents.length < advisor.handleNumber;
    });
    

    if (availableAdvisors.length === 0) {
      return res.status(404).json({ status: "not found", message: "No available advisors found." });
    }

    // Calculate match percentage for available advisors
    const advisorsWithMatchPercentage = availableAdvisors.map(advisor => {
      const matchedSpecializations = advisor.specializations.filter(specialization =>
        escapedQueryTerms.some(term => new RegExp(term, 'i').test(specialization))
      );

      const matchPercentage = (matchedSpecializations.length / escapedQueryTerms.length) * 100;
      return { advisor, matchPercentage };
    });

    advisorsWithMatchPercentage.sort((a, b) => b.matchPercentage - a.matchPercentage);
    const top5Advisors = advisorsWithMatchPercentage.slice(0, 5);

    return res.status(200).json({
      status: "ok",
      results: top5Advisors.map(item => ({
        advisor: item.advisor,
        matchPercentage: item.matchPercentage.toFixed(2),
        specializations: item.advisor.specializations,
        channelId: item.advisor.channelId,
      })),
    });

  } catch (error) {
    console.error("Error submitting proposal:", error);
    return res.status(500).send("Internal server error.");
  }
};

export const chooseNewAdvisor = async (req: Request, res: Response) => {
  const { userId, advisorId } = req.body;

  if (!userId || !advisorId) {
    return res.status(400).json({ message: 'userId and advisorId are required.' });
  }

  try {
    // Fetch the student
    const student = await User.findById(userId) as IStudent | null;
    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    // Ensure advisor hasn't already been chosen unless declined
    if (student.chosenAdvisor && student.advisorStatus !== 'declined') {
      return res.status(400).json({ message: 'Advisor already chosen.' });
    }

    // Fetch the selected advisor
    const selectedAdvisor = await User.findById(advisorId) as IUser | null;
    if (!selectedAdvisor) {
      return res.status(404).json({ message: 'Advisor not found.' });
    }

    // Validate selected advisor's capacity
    if (
      selectedAdvisor.handleNumber !== undefined &&
      selectedAdvisor.acceptedStudents.length >= selectedAdvisor.handleNumber
    ) {
      return res.status(400).json({ message: 'This advisor has already accepted the maximum number of students.' });
    }

    // Save the selected advisor
    student.chosenAdvisor = advisorId;
    student.advisorStatus = 'pending';

    // Expand keywords for advisor matching
    const expandedQueryTerms = await expandEntitiesWithSynonyms(student.proposals.slice(-1)[0]?.proposalText || "");
    const escapedQueryTerms = expandedQueryTerms.map(term =>
      term.replace(/[.*+?^=!:${}()|\[\]\/\\]/g, "\\$&")
    );

    // Fetch additional advisors for panelist roles
    let advisors = await User.find({
      role: 'adviser',
      isApproved: true,
      specializations: { $in: escapedQueryTerms.map(term => new RegExp(term, 'i')) },
    });

    // Exclude the chosen advisor from the list
    advisors = advisors.filter(advisor => advisor._id.toString() !== advisorId);

    // Map panelist roles
    const panelistsByRole: { [role: string]: IUser[] } = {
      'Technical Expert': [],
      'Statistician': [],
      'Subject Expert': [],
    };

    // Assign advisors to roles
    for (const advisor of advisors) {
      if (advisor.design && panelistsByRole[advisor.design] && panelistsByRole[advisor.design].length === 0) {
        panelistsByRole[advisor.design].push(advisor);
      }
    }

    // Fill roles with unlimited advisors if necessary
    for (const [role, panelists] of Object.entries(panelistsByRole)) {
      if (panelists.length === 0) {
        const moreAdvisors = await User.find({
          role: 'adviser',
          isApproved: true,
          specializations: { $in: escapedQueryTerms.map(term => new RegExp(term, 'i')) },
        }).limit(5); // Dynamically fetch more advisors for panelist roles

        panelistsByRole[role].push(...moreAdvisors);
      }
    }

    // Combine all panelists
    const allPanelists = Object.values(panelistsByRole).flat();

    // Save panelists in the student's record
    student.panelists = allPanelists.map(panelist => panelist._id as ObjectId);

    await student.save();

    return res.status(200).json({
      message: 'Advisor chosen and panelists assigned successfully.',
      advisor: selectedAdvisor,
      panelists: allPanelists,
    });

  } catch (error) {
    console.error("Error choosing advisor:", error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};


export const trainingProposal = async (req: Request, res: Response) => {
  const { terms } = req.body;

  // Ensure terms is an array
  if (!terms || !Array.isArray(terms)) {
    return res.status(400).json({ message: 'A list of terms with synonyms is required.' });
  }

  try {
    // Create a promise for each term entry
    const promises = terms.map(async (entry: { terms: string[]; synonyms: string[] }) => {
      const { terms: entryTerms, synonyms } = entry;

      // Validate the structure of the entry
      if (!Array.isArray(entryTerms) || !Array.isArray(synonyms)) {
        throw new Error(`Invalid entry: ${JSON.stringify(entry)}`);
      }

      // Always create a new synonym entry without checking for existing ones
      const synonymEntry = new Synonym({ terms: entryTerms, synonyms });
      await synonymEntry.save();  // Save the new synonym entry

      return synonymEntry;  // Return the newly created entry
    });

    // Wait for all promises to complete
    const results = await Promise.all(promises);

    // Send back the created entries in the response
    res.status(201).json({ message: 'Synonyms added successfully', data: results });
  } catch (error) {
    console.error('Error training proposal:', error);
    res.status(500).json({ message: 'Server error', error });
  }
};



export const editUserProfile = async (req: Request, res: Response) => {
  const { id } = req.params; // Admin ID
  const { name, email, deleteProfileImage } = req.body; // Data from request body

  const profileImage = (req as any).file?.filename; // Get new profile image if exists

  try {
    // Find the admin by ID
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Prepare the update object conditionally
    const updateData: any = {
      name,
      email,
    };

    if (deleteProfileImage) {
      // Check if profile image exists before deleting it
      if (user.profileImage) {
        const imagePath = path.join(__dirname, "../public/uploads", user.profileImage);
        // Remove the old image if it exists
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath); // Delete the old image file
        }
      }

      updateData.profileImage = ""; // Remove image from database
    }

    if (profileImage) {
      // If a new image is provided, update it
      updateData.profileImage = profileImage;
    }

    // Find the admin and update with new details
    const updatedUser = await User.findByIdAndUpdate(id, updateData, { new: true });

    res.json({ message: "User profile updated successfully", user: updatedUser });
    
  } catch (error) {
    console.error("Error updating User profile:", error);
    res.status(500).json({ message: "Server error", error });
  }
};

export const resetUserPassword = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({ message: "New password is required." });
  }

  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User Student not found" });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update the password
    user.password = hashedPassword;

    // Save the updated admin
    await user.save();
    return res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error", error });
  }
  };


export const getStudentInfoAndProposal = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId; // Assuming you're passing the userId as a parameter

    const user = await User.findById(userId)
      .populate('chosenAdvisor')
      .populate('panelists');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if advisor is accepted before fetching the proposal
    const proposal = user.advisorStatus === 'accepted'
      ? user.proposals[user.proposals.length - 1] // Get the latest proposal
      : null;

    const response = {
      chosenAdvisor: user.chosenAdvisor,
      advisorStatus: user.advisorStatus,
      panelists: user.panelists,
      channelId: user.channelId,
      manuscriptStatus: user.manuscriptStatus,
      proposal: proposal ? {
        proposalTitle: proposal.proposalTitle,
        proposalText: proposal.proposalText,
        submittedAt: proposal.submittedAt
      } : null
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching student info and proposal:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};



import Article from '../models/pdfDetails';
import { ObjectId } from 'mongodb';

export const getAllArticles = async (req: Request, res: Response): Promise<void> => {
  try {
      const articles = await Article.find({}, 'title authors dateUploaded datePublished pdf');
      res.status(200).json(articles);
  } catch (error) {
      if (error instanceof Error) {
          res.status(500).json({ message: error.message });
      } else {
          res.status(500).json({ message: 'An unknown error occurred.' });
      }
  }
};

export const searchArticles = async (req: Request, res: Response): Promise<void> => {
  const { query } = req.query;
  try {
      const articles = await Article.find({
          $or: [
              { title: new RegExp(query as string, 'i') },
              { authors: new RegExp(query as string, 'i') }
          ]
      }, 'title authors dateUploaded datePublished pdf');
      res.status(200).json(articles);
  } catch (error) {
      if (error instanceof Error) {
          res.status(500).json({ message: error.message });
      } else {
          res.status(500).json({ message: 'An unknown error occurred.' });
      }
  }
};

export const markTaskAsCompleted = async (req: Request, res: Response) => {
  const { taskId } = req.params;

  try {
    // Find the student with the specific task
    const student = await User.findOne({ 'tasks._id': taskId });
    if (!student) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Use Mongoose's .id() method to find the task by its _id
    const task = student.tasks.id(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Mark task as completed
    task.isCompleted = true;
    // console.log('Task before saving:', task); // Log the task state
    await student.save();

    // After saving the student
    res.status(200).json({ message: 'Task marked as completed', task });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};


export const getTasks = async (req: Request, res: Response) => {
  const { userId } = req.params; // Use studentId instead of taskId

  // console.log('Received studentId:', userId); // Log the received studentId

  try {
    // Find the student and populate tasks
    const student = await User.findById(userId).select('tasks');
    
    if (!student) {
      // console.log('No student found with studentId:', userId);
      return res.status(404).json({ message: 'Student not found' });
    }

    // Return the tasks
    res.status(200).json({ tasks: student.tasks });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

// Endpoint to get task progress
export const getTaskProgress = async (req: Request, res: Response) => {
  const { userId } = req.params;

  try {
    const student = await User.findById(userId).select('tasks');
    if (!student || student.tasks.length === 0) {
      return res.status(404).json({ message: 'No tasks found for this student' });
    }

    // Calculate completed task percentage
    const completedTasks = student.tasks.filter((task) => task.isCompleted).length;
    const totalTasks = student.tasks.length;
    const progress = Math.round((completedTasks / totalTasks) * 100); 

    res.status(200).json({ progress });
  } catch (error) {
    console.error('Error fetching task progress:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const updateProposalTitle = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    const { newTitle } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.advisorStatus !== 'accepted') {
      return res.status(403).json({ message: 'Proposal cannot be edited' });
    }

    user.proposals[user.proposals.length - 1].proposalTitle = newTitle;
    await user.save();

    res.status(200).json({
      proposalTitle: user.proposals[user.proposals.length - 1].proposalTitle,
    });
  } catch (error) {
    console.error('Error updating proposal title:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};



// FOR STUDENT FETCHING THERE OWN ADVICER+

/* export const getStudentAdvisorInfo = async (req: Request, res: Response) => {
  const { userId } = req.params;

  try {
    const student = await User.findById(userId).populate('chosenAdvisor').populate('panelists');
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    res.status(200).json({ chosenAdvisor: student.chosenAdvisor, advisorStatus: student.advisorStatus, panelists: student.panelists });
  } catch (error) {
    console.error('Error fetching student advisor info:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
}; */

// Training Endpoint
export const trainModel = async (req: Request, res: Response) => {
  const { language, data } = req.body; // Extracting language and data

  try {
    if (!NlpManager) {
      throw new Error("NlpManager is not loaded yet.");
    }

    const manager = new NlpManager({ languages: ['en'], forceNER: true });

    // Check if data is an array and contains training entries
    if (language && Array.isArray(data)) {
      data.forEach(({ text, sentiment, specializations, keywords }) => {
        if (text && sentiment && Array.isArray(specializations) && Array.isArray(keywords)) {
          manager.addDocument(language, text, sentiment);

          specializations.forEach(spec => {
            const keywordText = `This proposal is related to ${spec} and involves ${keywords.join(', ')}`;
            // console.log('Adding document:', keywordText);
            manager.addDocument(language, keywordText, sentiment);
          });
        } else {
          throw new Error('Invalid input data for a specific training entry.');
        }
      });
    } else {
      throw new Error('Invalid input data.');
    }

    await manager.train();
    manager.save();

    res.json({ message: 'Training data with keywords added successfully!' });
  } catch (error) {
    console.error('Error training model:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};


import PdfDetails from "../models/pdfDetails";

export const getPdfKeywordsCount = async (req: Request, res: Response) => {
  try {
    // Fetch the keywords from the Keywords collection
    const keywords = await Keyword.find();

    // Ensure there are keywords to search for
    if (keywords.length === 0) {
      return res.status(404).json({ error: "No keywords found" });
    }

    // Count documents that match each keyword in the title
    const counts = await Promise.all(
      keywords.map(async (keywordDoc) => {
        const keyword = keywordDoc.keyword; // Extract the keyword from the document

        // Count PdfDetails documents that contain the keyword in the title (case-insensitive)
        const count = await PdfDetails.countDocuments({
          title: { $regex: keyword, $options: 'i' }, // Case-insensitive regex search
        });

        return { category: keyword, value: count }; // Return the category (keyword) and its count
      })
    );

    // Send the counts as a response
    res.status(200).json(counts);
  } catch (error) {
    console.error("Error fetching PdfDetails count:", error);
    res.status(500).json({ error: "Failed to fetch PdfDetails count" });
  }
};



// GET endpoint to fetch all keywords
export const getKeywords = async (req: Request, res: Response) => {
  try {
    const keywords = await Keyword.find();
    res.status(200).json(keywords);
  } catch (error) {
    console.error("Error fetching keywords:", error);
    res.status(500).json({ error: "Failed to fetch keywords" });
  }
};


import Keyword from "../models/Keywords"; // Assuming the model is in models/Keyword.ts
// POST endpoint to add multiple keywords to the database
export const addKeywords = async (req: Request, res: Response) => {
  try {
    const { keywords } = req.body;

    // Validate that keywords is provided and is an array
    if (!keywords || !Array.isArray(keywords)) {
      return res.status(400).json({ error: "Keywords should be an array" });
    }

    // Ensure each keyword is a string
    const validKeywords = keywords.filter((keyword: any) => typeof keyword === "string");

    // Create an array of new keyword documents
    const keywordDocs = validKeywords.map((keyword) => new Keyword({ keyword }));

    // Save all keywords to the database at once
    await Keyword.insertMany(keywordDocs);

    res.status(201).json({ message: "Keywords added successfully", keywords: validKeywords });
  } catch (error) {
    console.error("Error adding keywords:", error);
    res.status(500).json({ error: "Failed to add keywords" });
  }
};

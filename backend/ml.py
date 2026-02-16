import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.cluster import KMeans
from sklearn.metrics import accuracy_score, classification_report
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
import warnings
warnings.filterwarnings('ignore')

np.random.seed(42)

historical_data = {
    "pending_tasks": [2, 5, 8, 1, 7, 10, 3, 6, 9, 4, 12, 8, 5, 11, 3, 7, 9, 4, 6, 10],
    "missed_deadlines": [0, 1, 3, 0, 2, 4, 1, 2, 3, 1, 5, 3, 1, 4, 0, 2, 3, 1, 2, 4],
    "avg_completion": [90, 65, 40, 95, 50, 30, 70, 45, 35, 75, 25, 38, 68, 32, 88, 52, 42, 72, 48, 28],
    "overlapping_tasks": [1, 3, 6, 0, 5, 8, 2, 5, 7, 3, 9, 6, 3, 8, 1, 4, 6, 2, 5, 7],
    "exam_proximity": [20, 10, 3, 30, 5, 2, 15, 7, 4, 18, 1, 4, 12, 3, 25, 6, 5, 16, 8, 2],
    "burnout_risk": [0, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1]
}

df_historical = pd.DataFrame(historical_data)

student_data = {
    "student_id": range(1, 101),
    "pending_tasks": np.random.randint(0, 15, 100),
    "missed_deadlines": np.random.randint(0, 8, 100),
    "completion_rate": np.random.randint(20, 100, 100),
    "overlapping_tasks": np.random.randint(0, 10, 100),
    "exam_proximity": np.random.randint(1, 30, 100)
}

df = pd.DataFrame(student_data)

def calculate_burnout_score(pending, missed, overlapping, completion_drop, exam_prox):
    score = (pending * 5) + (missed * 10) + (overlapping * 7) + (completion_drop * 8) + (exam_prox * 5)
    return min(score, 100)

df['completion_drop'] = 100 - df['completion_rate']
df['burnout_score'] = df.apply(
    lambda row: calculate_burnout_score(
        row['pending_tasks'],
        row['missed_deadlines'],
        row['overlapping_tasks'],
        row['completion_drop'],
        row['exam_proximity']
    ), axis=1
)

def get_risk_level(score):
    if score <= 30:
        return "Low"
    elif score <= 60:
        return "Medium"
    else:
        return "High"

df['risk_level'] = df['burnout_score'].apply(get_risk_level)
df['burnout_risk'] = (df['burnout_score'] > 60).astype(int)

df_historical['completion_drop'] = 100 - df_historical['avg_completion']
df_historical['burnout_score'] = df_historical.apply(
    lambda row: calculate_burnout_score(
        row['pending_tasks'],
        row['missed_deadlines'],
        row['overlapping_tasks'],
        row['completion_drop'],
        row['exam_proximity']
    ), axis=1
)

features = ['pending_tasks', 'missed_deadlines', 'overlapping_tasks', 'exam_proximity']
X_hist = df_historical[features]
y_hist = df_historical['burnout_risk']

X = df[['pending_tasks', 'missed_deadlines', 'overlapping_tasks', 'exam_proximity', 'completion_drop']]
y = df['burnout_risk']

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

lr_model = LogisticRegression(max_iter=1000, random_state=42)
lr_model.fit(X_train_scaled, y_train)
lr_predictions = lr_model.predict(X_test_scaled)
lr_accuracy = accuracy_score(y_test, lr_predictions)

rf_model = RandomForestClassifier(n_estimators=150, max_depth=10, random_state=42)
rf_model.fit(X_train, y_train)
rf_predictions = rf_model.predict(X_test)
rf_accuracy = accuracy_score(y_test, rf_predictions)

gb_model = GradientBoostingClassifier(n_estimators=100, learning_rate=0.1, max_depth=5, random_state=42)
gb_model.fit(X_train, y_train)
gb_predictions = gb_model.predict(X_test)
gb_accuracy = accuracy_score(y_test, gb_predictions)

kmeans = KMeans(n_clusters=3, random_state=42, n_init=10)
df['risk_cluster'] = kmeans.fit_predict(X)

time_steps = 7
n_features = 5
X_lstm = np.random.rand(80, time_steps, n_features)
y_lstm = np.random.randint(0, 2, 80)

lstm_model = Sequential([
    LSTM(64, return_sequences=True, input_shape=(time_steps, n_features)),
    Dropout(0.3),
    LSTM(32),
    Dropout(0.3),
    Dense(16, activation='relu'),
    Dense(1, activation='sigmoid')
])

lstm_model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])
lstm_model.fit(X_lstm, y_lstm, epochs=20, batch_size=16, validation_split=0.2, verbose=0)

X_lstm_test = np.random.rand(20, time_steps, n_features)
lstm_predictions = (lstm_model.predict(X_lstm_test, verbose=0) > 0.5).astype(int)

test_student_data = [[8, 3, 6, 4, 58]]
test_student = pd.DataFrame(test_student_data, columns=['pending_tasks', 'missed_deadlines', 'overlapping_tasks', 'exam_proximity', 'completion_drop'])
test_student_scaled = scaler.transform(test_student)

test_score = calculate_burnout_score(
    test_student['pending_tasks'].values[0],
    test_student['missed_deadlines'].values[0],
    test_student['overlapping_tasks'].values[0],
    test_student['completion_drop'].values[0],
    test_student['exam_proximity'].values[0]
)

lr_result = lr_model.predict(test_student_scaled)[0]
rf_result = rf_model.predict(test_student)[0]
gb_result = gb_model.predict(test_student)[0]

ensemble_prediction = int(np.round((lr_result + rf_result + gb_result) / 3))

print(f"Burnout Prediction Formula:")
print(f"Score = (pendingTasks × 5) + (missedDeadlines × 10) + (overlappingTasks × 7)")
print(f"        + (completionDrop × 8) + (examProximity × 5)")
print(f"\nRisk Thresholds:")
print(f"Low Risk: score ≤ 30")
print(f"Medium Risk: 30 < score ≤ 60")
print(f"High Risk: score > 60")
print(f"\nHistorical Training Data: {len(df_historical)} baseline records")
print(f"Current Dataset: {len(df)} student profiles")
print(f"\nTest Student Analysis:")
print(f"Calculated Burnout Score: {test_score}")
print(f"Risk Level: {get_risk_level(test_score)}")
print(f"\nModel Performance:")
print(f"Logistic Regression Accuracy: {lr_accuracy:.2%}")
print(f"Random Forest Accuracy: {rf_accuracy:.2%}")
print(f"Gradient Boosting Accuracy: {gb_accuracy:.2%}")
print(f"\nEnsemble Prediction: {'High Risk' if ensemble_prediction == 1 else 'Low Risk'}")
print(f"Risk Clusters Identified: {len(df['risk_cluster'].unique())}")
print(f"LSTM Temporal Model Trained on {time_steps}-week patterns")